//! 预览全屏的窗口侧处理。
//!
//! Windows 上 tauri-runtime-wry 会把「webview 里有全屏元素」镜像成窗口全屏：元素全屏开始时它调
//! `set_fullscreen(Some(Borderless(None)))`，结束时调 `set_fullscreen(None)`。镜像不知道窗口进入全屏前
//! 是什么形态，所以窗口形态的决策统一放在这里，前端只报元素全屏的开始/结束和进入前的形态：
//!
//! - 进入时按进入前的形态决定动作，窗口最大化时先补正（tao#1087：从最大化窗口进无边框全屏会留下黑边，
//!   而全屏中取消最大化会被 tao 还原成普通窗口，所以必须先退出全屏）；
//! - 退出时只还原本次引入的变化：本来就全屏的窗口保持全屏，最大化的还原最大化，普通的保持普通；
//! - 镜像可能在退出时晚一步把窗口退出全屏，所以在窗口事件里按目标形态补一次。

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WindowEvent};

use super::{AppError, AppResult};

/// 预览只在主窗口里，其他窗口的形态不受影响。
const MAIN_WINDOW_LABEL: &str = "main";

/// 窗口形态：进入元素全屏前的样子，也是退出时要还原的目标。
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowShape {
    pub fullscreen: bool,
    pub maximized: bool,
}

/// 进入元素全屏时窗口侧要做的事。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EnterAction {
    /// 窗口本来就全屏：不动它
    Keep,
    /// 先退出窗口全屏、取消最大化，再重新进全屏（tao#1087）
    CorrectMaximized,
    /// 直接进窗口全屏
    EnterFullscreen,
}

/// 退出元素全屏后，窗口事件的收敛结果。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettleAction {
    /// 没有待收敛的目标，或事件是窗口动作自己造成的
    Idle,
    /// 已经收敛到目标形态
    Settled,
    /// 窗口被镜像带偏，按目标形态补一次
    Reapply(WindowShape),
}

/// 进入前的形态决定进入动作。
pub fn enter_action(resting: WindowShape) -> EnterAction {
    if resting.fullscreen {
        EnterAction::Keep
    } else if resting.maximized {
        EnterAction::CorrectMaximized
    } else {
        EnterAction::EnterFullscreen
    }
}

/// 退出时要还原成的形态。全屏目标忽略最大化标志：那时窗口还在全屏里，标志只会是 tao 的残留。
pub fn restore_target(saved: WindowShape) -> WindowShape {
    WindowShape {
        fullscreen: saved.fullscreen,
        maximized: !saved.fullscreen && saved.maximized,
    }
}

/// 会话状态：进入前的形态 + 退出后的收敛。
#[derive(Debug)]
pub struct PreviewFullscreenState {
    /// Windows 上镜像会在元素全屏结束时自己退出窗口全屏，退出后需要兜一次形态
    mirror_exits_fullscreen: bool,
    /// `Some(进入前形态)` 表示元素全屏进行中
    session: Option<WindowShape>,
    /// 退出后还欠一次形态确认
    settle: Option<WindowShape>,
    /// 正在执行窗口动作：这期间产生的窗口事件是自己造成的，不算收敛
    applying: bool,
}

impl Default for PreviewFullscreenState {
    fn default() -> Self {
        Self::new(cfg!(target_os = "windows"))
    }
}

impl PreviewFullscreenState {
    pub fn new(mirror_exits_fullscreen: bool) -> Self {
        Self {
            mirror_exits_fullscreen,
            session: None,
            settle: None,
            applying: false,
        }
    }

    /// 开始会话；已经在会话里返回 `None`。
    pub fn begin(&mut self, resting: WindowShape) -> Option<EnterAction> {
        if self.session.is_some() {
            return None;
        }

        self.session = Some(resting);
        self.settle = None;

        Some(enter_action(resting))
    }

    /// 结束会话，返回退出时要还原的形态；没有进行中的会话返回 `None`。
    pub fn finish(&mut self) -> Option<WindowShape> {
        let saved = self.session.take()?;
        let target = restore_target(saved);

        // 只有「退出后要保持全屏」才需要兜：镜像退出全屏后会把窗口留在非全屏，
        // 其他目标本来就要求窗口退出全屏，镜像那次调用是幂等的
        self.settle = (self.mirror_exits_fullscreen && target.fullscreen).then_some(target);

        Some(target)
    }

    pub fn set_applying(&mut self, applying: bool) {
        self.applying = applying;
    }

    /// 窗口事件里的收敛判断：只认第一件不是自己造成的窗口事件。
    pub fn settle(&mut self, current: WindowShape) -> SettleAction {
        if self.applying {
            return SettleAction::Idle;
        }

        let Some(target) = self.settle.take() else {
            return SettleAction::Idle;
        };

        if current == target {
            SettleAction::Settled
        } else {
            SettleAction::Reapply(target)
        }
    }
}

/// 窗口形态的读写；单独抽出来是为了用假窗口断言调用顺序。
pub trait PreviewFullscreenWindow {
    fn window_shape(&self) -> AppResult<WindowShape>;
    fn set_window_fullscreen(&self, fullscreen: bool) -> AppResult<()>;
    fn set_window_maximized(&self, maximized: bool) -> AppResult<()>;
}

impl<R: Runtime> PreviewFullscreenWindow for WebviewWindow<R> {
    fn window_shape(&self) -> AppResult<WindowShape> {
        Ok(WindowShape {
            fullscreen: self.is_fullscreen()?,
            maximized: self.is_maximized()?,
        })
    }

    fn set_window_fullscreen(&self, fullscreen: bool) -> AppResult<()> {
        self.set_fullscreen(fullscreen)?;

        Ok(())
    }

    fn set_window_maximized(&self, maximized: bool) -> AppResult<()> {
        if maximized {
            self.maximize()?;
        } else {
            self.unmaximize()?;
        }

        Ok(())
    }
}

/// 执行进入动作。
pub fn apply_enter(window: &impl PreviewFullscreenWindow, action: EnterAction) -> AppResult<()> {
    match action {
        EnterAction::Keep => Ok(()),
        EnterAction::EnterFullscreen => window.set_window_fullscreen(true),
        EnterAction::CorrectMaximized => {
            // 顺序不能换（见文件头）：全屏中取消最大化会把窗口还原成普通窗口
            window.set_window_fullscreen(false)?;
            window.set_window_maximized(false)?;
            window.set_window_fullscreen(true)
        }
    }
}

/// 把窗口还原到目标形态。
pub fn apply_shape(window: &impl PreviewFullscreenWindow, target: WindowShape) -> AppResult<()> {
    window.set_window_fullscreen(target.fullscreen)?;

    if !target.fullscreen && target.maximized {
        window.set_window_maximized(true)?;
    }

    Ok(())
}

type PreviewFullscreenStateHandle = Mutex<PreviewFullscreenState>;

fn main_window<R: Runtime>(app: &AppHandle<R>) -> AppResult<WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| AppError::Window(format!("找不到窗口 {MAIN_WINDOW_LABEL}")))
}

/// 执行窗口动作，期间标记成「自己造成的窗口事件」。
fn run_window_action(
    state: &PreviewFullscreenStateHandle,
    action: impl FnOnce() -> AppResult<()>,
) -> AppResult<()> {
    state.lock().unwrap().set_applying(true);
    let result = action();
    state.lock().unwrap().set_applying(false);

    result
}

/// 开始预览全屏会话：按进入前的形态把窗口带进全屏。
#[tauri::command]
pub async fn preview_fullscreen_enter(
    app: AppHandle,
    resting: WindowShape,
    state: tauri::State<'_, PreviewFullscreenStateHandle>,
) -> AppResult<()> {
    let window = main_window(&app)?;
    let action = state.lock().unwrap().begin(resting);

    let Some(action) = action else {
        return Ok(());
    };

    run_window_action(&state, || apply_enter(&window, action))
}

/// 结束预览全屏会话：只还原本次引入的变化，返回还原后的形态。
#[tauri::command]
pub async fn preview_fullscreen_exit(
    app: AppHandle,
    state: tauri::State<'_, PreviewFullscreenStateHandle>,
) -> AppResult<WindowShape> {
    let window = main_window(&app)?;
    let target = state.lock().unwrap().finish();

    let Some(target) = target else {
        return window.window_shape();
    };

    run_window_action(&state, || apply_shape(&window, target))?;

    Ok(target)
}

/// 窗口事件钩子：镜像可能晚一步把窗口退出全屏，这里把目标形态补回来。
pub fn handle_window_event<R: Runtime>(
    window: &WebviewWindow<R>,
    event: &WindowEvent,
    state: &PreviewFullscreenStateHandle,
) {
    if !matches!(event, WindowEvent::Resized(_)) {
        return;
    }

    let Ok(current) = window.window_shape() else {
        return;
    };

    let SettleAction::Reapply(target) = state.lock().unwrap().settle(current) else {
        return;
    };

    log::debug!("预览全屏：窗口形态被改动，补回 {target:?}");

    if let Err(error) = run_window_action(state, || apply_shape(window, target)) {
        log::warn!("预览全屏：补回窗口形态失败: {error}");
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::{
        apply_enter, apply_shape, enter_action, restore_target, EnterAction,
        PreviewFullscreenState, PreviewFullscreenWindow, SettleAction, WindowShape,
    };
    use crate::commands::AppResult;

    const NORMAL: WindowShape = WindowShape {
        fullscreen: false,
        maximized: false,
    };
    const MAXIMIZED: WindowShape = WindowShape {
        fullscreen: false,
        maximized: true,
    };
    const FULLSCREEN: WindowShape = WindowShape {
        fullscreen: true,
        maximized: false,
    };

    struct FakeWindow {
        calls: RefCell<Vec<String>>,
        shape: RefCell<WindowShape>,
    }

    impl FakeWindow {
        fn new(shape: WindowShape) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                shape: RefCell::new(shape),
            }
        }

        fn calls(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
    }

    impl PreviewFullscreenWindow for FakeWindow {
        fn window_shape(&self) -> AppResult<WindowShape> {
            Ok(*self.shape.borrow())
        }

        fn set_window_fullscreen(&self, fullscreen: bool) -> AppResult<()> {
            self.calls
                .borrow_mut()
                .push(format!("set_fullscreen({fullscreen})"));
            self.shape.borrow_mut().fullscreen = fullscreen;

            Ok(())
        }

        fn set_window_maximized(&self, maximized: bool) -> AppResult<()> {
            self.calls
                .borrow_mut()
                .push(format!("set_maximized({maximized})"));
            self.shape.borrow_mut().maximized = maximized;

            Ok(())
        }
    }

    #[test]
    fn enter_action_keeps_a_fullscreen_window_untouched() {
        assert_eq!(enter_action(FULLSCREEN), EnterAction::Keep);
    }

    #[test]
    fn enter_action_corrects_a_maximized_window() {
        assert_eq!(enter_action(MAXIMIZED), EnterAction::CorrectMaximized);
    }

    #[test]
    fn enter_action_enters_fullscreen_from_a_normal_window() {
        assert_eq!(enter_action(NORMAL), EnterAction::EnterFullscreen);
    }

    #[test]
    fn restore_target_ignores_the_maximized_flag_while_fullscreen() {
        assert_eq!(
            restore_target(WindowShape {
                fullscreen: true,
                maximized: true,
            }),
            FULLSCREEN
        );
        assert_eq!(restore_target(MAXIMIZED), MAXIMIZED);
        assert_eq!(restore_target(NORMAL), NORMAL);
    }

    #[test]
    fn apply_enter_corrects_the_window_before_entering_fullscreen() {
        let window = FakeWindow::new(MAXIMIZED);

        apply_enter(&window, EnterAction::CorrectMaximized).expect("enter should apply");

        assert_eq!(
            window.calls(),
            [
                "set_fullscreen(false)",
                "set_maximized(false)",
                "set_fullscreen(true)"
            ]
        );
    }

    #[test]
    fn apply_enter_leaves_an_already_fullscreen_window_alone() {
        let window = FakeWindow::new(FULLSCREEN);

        apply_enter(&window, EnterAction::Keep).expect("enter should apply");

        assert!(window.calls().is_empty());
    }

    #[test]
    fn apply_shape_restores_maximized_after_leaving_fullscreen() {
        let window = FakeWindow::new(FULLSCREEN);

        apply_shape(&window, restore_target(MAXIMIZED)).expect("restore should apply");

        assert_eq!(
            window.calls(),
            ["set_fullscreen(false)", "set_maximized(true)"]
        );
    }

    #[test]
    fn session_ignores_a_second_enter_and_reports_the_restore_target() {
        let mut state = PreviewFullscreenState::new(true);

        assert_eq!(state.begin(MAXIMIZED), Some(EnterAction::CorrectMaximized));
        assert_eq!(state.begin(MAXIMIZED), None);
        assert_eq!(state.finish(), Some(MAXIMIZED));
        assert_eq!(state.finish(), None);
    }

    #[test]
    fn session_corrects_the_shape_when_the_mirror_exits_fullscreen_late() {
        let mut state = PreviewFullscreenState::new(true);
        state.begin(FULLSCREEN);
        state.finish();

        assert_eq!(state.settle(NORMAL), SettleAction::Reapply(FULLSCREEN));
        // 只补一次，之后不再干预窗口
        assert_eq!(state.settle(NORMAL), SettleAction::Idle);
    }

    #[test]
    fn session_ignores_window_events_caused_by_its_own_actions() {
        let mut state = PreviewFullscreenState::new(true);
        state.begin(FULLSCREEN);
        state.finish();

        state.set_applying(true);
        assert_eq!(state.settle(NORMAL), SettleAction::Idle);
        state.set_applying(false);

        assert_eq!(state.settle(FULLSCREEN), SettleAction::Settled);
    }

    #[test]
    fn session_does_not_settle_a_non_fullscreen_target() {
        let mut state = PreviewFullscreenState::new(true);
        state.begin(MAXIMIZED);
        state.finish();

        assert_eq!(state.settle(MAXIMIZED), SettleAction::Idle);
    }

    #[test]
    fn session_does_not_watch_window_events_without_the_mirror() {
        let mut state = PreviewFullscreenState::new(false);
        state.begin(FULLSCREEN);
        state.finish();

        assert_eq!(state.settle(NORMAL), SettleAction::Idle);
    }
}
