use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub struct WindowConfig {
    label: String,
    url: WebviewUrl,
    title: Option<String>,
    min_width: f64,
    min_height: f64,
    width: f64,
    height: f64,
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
            min_width: 620.0,
            min_height: 540.0,
            width: 1280.0,
            height: 800.0,
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
        self.min_width = width;
        self.min_height = height;
        self
    }

    pub fn size(mut self, width: f64, height: f64) -> Self {
        self.width = width;
        self.height = height;
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

    pub fn build<R: tauri::Runtime, M: Manager<R>>(
        self,
        manager: &M,
    ) -> tauri::Result<tauri::WebviewWindow<R>> {
        log::info!("正在创建窗口 '{}'，URL: '{:?}'", self.label, self.url);

        let mut builder = WebviewWindowBuilder::new(manager, &self.label, self.url)
            .resizable(self.resizable)
            .min_inner_size(self.min_width, self.min_height)
            .inner_size(self.width, self.height);

        if let Some(title) = self.title {
            builder = builder.title(title);
        }

        if self.center {
            builder = builder.center();
        }

        #[cfg(target_os = "windows")]
        {
            builder = builder.additional_browser_args("--force_high_performance_gpu");
        }

        #[cfg(not(target_os = "macos"))]
        {
            if self.use_custom_title_bar {
                builder = builder.decorations(false);
            }
        }

        #[cfg(target_os = "macos")]
        {
            if self.use_custom_title_bar {
                builder = builder
                    .hidden_title(true)
                    .title_bar_style(tauri::TitleBarStyle::Overlay);
            }
        }

        builder.build()
    }
}

pub fn create_main<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    title: impl Into<String>,
) -> tauri::Result<tauri::WebviewWindow<R>> {
    WindowConfig::new("main", WebviewUrl::default())
        .title(title)
        .min_size(620.0, 540.0)
        .size(1280.0, 800.0)
        .center(true)
        .use_custom_title_bar(true)
        .build(manager)
}
