use tauri::{AppHandle, Runtime, WebviewUrl, WebviewWindowBuilder};

pub struct WindowConfig {
    label: String,
    url: WebviewUrl,
    title: Option<String>,
    min_width: Option<f64>,
    min_height: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    resizable: bool,
    center: bool,
    use_custom_title_bar: bool,
}

impl WindowConfig {
    pub fn new(label: impl Into<String>, url: WebviewUrl) -> Self {
        Self {
            label: label.into(),
            url,
            title: None,
            min_width: None,
            min_height: None,
            width: None,
            height: None,
            resizable: true,
            center: false,
            use_custom_title_bar: false,
        }
    }

    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    pub fn min_size(mut self, width: f64, height: f64) -> Self {
        self.min_width = Some(width);
        self.min_height = Some(height);
        self
    }

    pub fn size(mut self, width: f64, height: f64) -> Self {
        self.width = Some(width);
        self.height = Some(height);
        self
    }

    pub fn resizable(mut self, resizable: bool) -> Self {
        self.resizable = resizable;
        self
    }

    pub fn center(mut self, center: bool) -> Self {
        self.center = center;
        self
    }

    pub fn use_custom_title_bar(mut self, use_custom_title_bar: bool) -> Self {
        self.use_custom_title_bar = use_custom_title_bar;
        self
    }

    pub fn main(title: impl Into<String>) -> Self {
        Self::new("main", WebviewUrl::default())
            .title(title)
            .min_size(620.0, 540.0)
            .size(1280.0, 800.0)
            .center(true)
            .use_custom_title_bar(true)
    }

    fn apply_platform_tweaks<'a, R: Runtime, M: tauri::Manager<R>>(
        use_custom_title_bar: bool,
        builder: WebviewWindowBuilder<'a, R, M>,
    ) -> WebviewWindowBuilder<'a, R, M> {
        #[cfg(target_os = "windows")]
        let builder = builder.additional_browser_args("--force_high_performance_gpu");

        #[cfg(not(target_os = "macos"))]
        let builder = if use_custom_title_bar {
            builder.decorations(false)
        } else {
            builder
        };

        #[cfg(target_os = "macos")]
        let builder = if use_custom_title_bar {
            builder
                .hidden_title(true)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
        } else {
            builder
        };

        builder
    }

    pub fn build<R: Runtime>(self, handle: &AppHandle<R>) -> tauri::Result<tauri::WebviewWindow<R>> {
        let WindowConfig {
            label,
            url,
            title,
            min_width,
            min_height,
            width,
            height,
            resizable,
            center,
            use_custom_title_bar,
        } = self;

        log::info!("正在创建窗口 '{}'，URL: '{:?}'", label, url);

        let mut builder = WebviewWindowBuilder::new(handle, &label, url).resizable(resizable);

        if let (Some(width), Some(height)) = (min_width, min_height) {
            builder = builder.min_inner_size(width, height);
        }

        if let (Some(width), Some(height)) = (width, height) {
            builder = builder.inner_size(width, height);
        }

        if let Some(title) = title {
            builder = builder.title(title);
        }

        if center {
            builder = builder.center();
        }

        builder = Self::apply_platform_tweaks(use_custom_title_bar, builder);

        builder.build()
    }
}

pub fn create_main<R: Runtime>(
    handle: &AppHandle<R>,
    title: impl Into<String>,
) -> tauri::Result<tauri::WebviewWindow<R>> {
    WindowConfig::main(title).build(handle)
}
