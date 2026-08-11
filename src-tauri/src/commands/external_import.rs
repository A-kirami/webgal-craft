use std::{
    fs::{self, OpenOptions},
    io::{self, ErrorKind},
    path::{Component, Path},
};

use super::{AppError, AppResult};
use crate::vfs::VfsError;

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }

    #[cfg(not(windows))]
    {
        false
    }
}

fn path_denied() -> AppError {
    VfsError::PathDenied.into()
}

fn validate_import_name(name: &str) -> AppResult<()> {
    let mut components = Path::new(name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(path_denied()),
    }
}

fn import_name_parts(base_name: &str, is_directory: bool) -> (&str, &str) {
    let last_dot = base_name.rfind('.');
    let has_extension = !is_directory && last_dot.is_some_and(|index| index > 0);
    if has_extension {
        base_name.split_at(last_dot.expect("extension index should exist"))
    } else {
        (base_name, "")
    }
}

fn numbered_import_name(base_name: &str, is_directory: bool, counter: usize) -> String {
    let (stem, extension) = import_name_parts(base_name, is_directory);
    format!("{stem} ({counter}){extension}")
}

fn next_conflict_counter(
    source_name: &str,
    is_directory: bool,
    preferred_name: &str,
) -> AppResult<usize> {
    if preferred_name == source_name {
        return Ok(1);
    }

    let (stem, extension) = import_name_parts(source_name, is_directory);
    let prefix = format!("{stem} (");
    let suffix = format!("){extension}");
    let counter = preferred_name
        .strip_prefix(&prefix)
        .and_then(|value| value.strip_suffix(&suffix))
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|counter| *counter > 0)
        .ok_or_else(path_denied)?;

    if numbered_import_name(source_name, is_directory, counter) != preferred_name {
        return Err(path_denied());
    }

    counter.checked_add(1).ok_or_else(path_denied)
}

fn validate_created_destination(destination: &Path, project_root: &Path) -> AppResult<()> {
    let canonical_destination = destination.canonicalize()?;
    if canonical_destination != destination || !canonical_destination.starts_with(project_root) {
        return Err(path_denied());
    }

    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)?;

        if is_link_or_reparse_point(&metadata) {
            return Err(path_denied());
        }

        if metadata.is_dir() {
            fs::create_dir(&destination_path)?;
            copy_directory(&source_path, &destination_path)?;
        } else if metadata.is_file() {
            let mut source_file = fs::File::open(&source_path)?;
            let mut destination_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination_path)?;
            io::copy(&mut source_file, &mut destination_file)?;
        } else {
            return Err(path_denied());
        }
    }

    Ok(())
}

fn rollback_destination(
    destination: &Path,
    is_directory: bool,
    import_error: AppError,
) -> AppError {
    let cleanup_result = if is_directory {
        fs::remove_dir_all(destination)
    } else {
        fs::remove_file(destination)
    };

    match cleanup_result {
        Ok(()) => import_error,
        Err(cleanup_error) => AppError::Server(format!(
            "外部导入失败且无法清理目标 {}：导入错误: {import_error}；清理错误: {cleanup_error}",
            destination.display(),
        )),
    }
}

fn import_external_entry_impl(
    source: &Path,
    target_directory: &Path,
    preferred_name: &str,
    project_root: &Path,
) -> AppResult<String> {
    validate_import_name(preferred_name)?;

    let source_metadata = fs::symlink_metadata(source)?;
    if is_link_or_reparse_point(&source_metadata)
        || (!source_metadata.is_file() && !source_metadata.is_dir())
    {
        return Err(path_denied());
    }

    let canonical_source = source.canonicalize()?;
    let canonical_project_root = project_root.canonicalize()?;
    let canonical_target_directory = target_directory.canonicalize()?;
    if !canonical_project_root.is_dir()
        || !canonical_target_directory.is_dir()
        || !canonical_target_directory.starts_with(&canonical_project_root)
    {
        return Err(path_denied());
    }

    let is_directory = source_metadata.is_dir();
    if is_directory && canonical_target_directory.starts_with(&canonical_source) {
        return Err(path_denied());
    }

    let source_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(path_denied)?;
    let mut candidate_name = preferred_name.to_owned();
    let mut counter = next_conflict_counter(source_name, is_directory, preferred_name)?;

    loop {
        let destination = canonical_target_directory.join(&candidate_name);

        if is_directory {
            match fs::create_dir(&destination) {
                Ok(()) => {
                    let copy_result =
                        validate_created_destination(&destination, &canonical_project_root)
                            .and_then(|()| copy_directory(&canonical_source, &destination));

                    if let Err(error) = copy_result {
                        return Err(rollback_destination(&destination, true, error));
                    }
                    return Ok(candidate_name);
                }
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        } else {
            match OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination)
            {
                Ok(mut destination_file) => {
                    let copy_result =
                        validate_created_destination(&destination, &canonical_project_root)
                            .and_then(|()| {
                                let mut source_file = fs::File::open(&canonical_source)?;
                                io::copy(&mut source_file, &mut destination_file)?;
                                Ok(())
                            });
                    drop(destination_file);

                    if let Err(error) = copy_result {
                        return Err(rollback_destination(&destination, false, error));
                    }
                    return Ok(candidate_name);
                }
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }

        candidate_name = numbered_import_name(source_name, is_directory, counter);
        counter = counter.checked_add(1).ok_or_else(path_denied)?;
    }
}

#[tauri::command]
pub async fn import_external_entry(
    source: String,
    target_directory: String,
    preferred_name: String,
    project_root: String,
) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_external_entry_impl(
            Path::new(&source),
            Path::new(&target_directory),
            &preferred_name,
            Path::new(&project_root),
        )
    })
    .await
    .map_err(|error| AppError::Server(format!("外部导入任务执行失败: {error}")))?
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use std::process::Command;
    use std::{
        fs,
        path::Path,
        sync::{Arc, Barrier},
        thread,
    };

    use tempfile::tempdir;

    use super::{import_external_entry_impl, AppError};

    #[cfg(unix)]
    fn create_dir_link(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).expect("directory symlink should be created");
    }

    #[cfg(windows)]
    fn create_dir_link(target: &Path, link: &Path) {
        let command = format!(
            "$link = '{}'; $target = '{}'; New-Item -ItemType Junction -Path $link -Target $target | Out-Null",
            link.display(),
            target.display(),
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &command])
            .status()
            .expect("junction command should run");

        assert!(status.success(), "directory junction should be created");
    }

    #[test]
    fn import_external_entry_copies_files_and_resolves_concurrent_name_conflicts() {
        let fixture = tempdir().expect("fixture should be created");
        let project = fixture.path().join("project");
        let target = project.join("game/background");
        let first_source = fixture.path().join("first/hero.png");
        let second_source = fixture.path().join("second/hero.png");
        fs::create_dir_all(&target).expect("target should be created");
        fs::create_dir_all(first_source.parent().expect("source should have parent"))
            .expect("first source parent should be created");
        fs::create_dir_all(second_source.parent().expect("source should have parent"))
            .expect("second source parent should be created");
        fs::write(&first_source, "first").expect("first source should be written");
        fs::write(&second_source, "second").expect("second source should be written");

        let barrier = Arc::new(Barrier::new(2));
        let handles = [first_source, second_source].map(|source| {
            let barrier = Arc::clone(&barrier);
            let project = project.clone();
            let target = target.clone();
            thread::spawn(move || {
                barrier.wait();
                import_external_entry_impl(&source, &target, "hero.png", &project)
                    .expect("concurrent import should succeed")
            })
        });
        let mut imported_names = handles
            .into_iter()
            .map(|handle| handle.join().expect("import thread should finish"))
            .collect::<Vec<_>>();
        imported_names.sort();

        assert_eq!(imported_names, ["hero (1).png", "hero.png"]);
        let mut imported_contents = imported_names
            .iter()
            .map(|name| fs::read_to_string(target.join(name)).expect("import should be readable"))
            .collect::<Vec<_>>();
        imported_contents.sort();
        assert_eq!(imported_contents, ["first", "second"]);
    }

    #[test]
    fn import_external_entry_copies_directory_tree() {
        let fixture = tempdir().expect("fixture should be created");
        let project = fixture.path().join("project");
        let target = project.join("game/scene");
        let source = fixture.path().join("chapter");
        fs::create_dir_all(&target).expect("target should be created");
        fs::create_dir_all(source.join("nested")).expect("source tree should be created");
        fs::write(source.join("start.txt"), "start").expect("source file should be written");
        fs::write(source.join("nested/next.txt"), "next")
            .expect("nested source file should be written");

        let imported_name = import_external_entry_impl(&source, &target, "chapter", &project)
            .expect("directory import should succeed");

        assert_eq!(imported_name, "chapter");
        assert_eq!(
            fs::read_to_string(target.join("chapter/start.txt"))
                .expect("imported file should be readable"),
            "start"
        );
        assert_eq!(
            fs::read_to_string(target.join("chapter/nested/next.txt"))
                .expect("nested imported file should be readable"),
            "next"
        );
    }

    #[test]
    fn import_external_entry_continues_numbering_after_preferred_name_conflict() {
        let fixture = tempdir().expect("fixture should be created");
        let project = fixture.path().join("project");
        let target = project.join("game/background");
        let source = fixture.path().join("hero.png");
        fs::create_dir_all(&target).expect("target should be created");
        fs::write(&source, "new").expect("source should be written");
        fs::write(target.join("hero (2).png"), "existing")
            .expect("preferred target conflict should be written");

        let imported_name = import_external_entry_impl(&source, &target, "hero (2).png", &project)
            .expect("import should continue after preferred conflict number");

        assert_eq!(imported_name, "hero (3).png");
        assert_eq!(
            fs::read_to_string(target.join("hero (2).png"))
                .expect("existing target should remain readable"),
            "existing"
        );
        assert_eq!(
            fs::read_to_string(target.join("hero (3).png"))
                .expect("imported target should be readable"),
            "new"
        );
    }

    #[test]
    fn import_external_entry_rejects_target_link_outside_project() {
        let fixture = tempdir().expect("fixture should be created");
        let project = fixture.path().join("project");
        let outside = fixture.path().join("outside");
        let linked_target = project.join("linked-target");
        let source = fixture.path().join("hero.png");
        fs::create_dir_all(&project).expect("project should be created");
        fs::create_dir_all(&outside).expect("outside target should be created");
        fs::write(&source, "hero").expect("source should be written");
        create_dir_link(&outside, &linked_target);

        let error = import_external_entry_impl(&source, &linked_target, "hero.png", &project)
            .expect_err("linked target outside project should be rejected");

        assert!(matches!(error, AppError::Vfs(_)));
        assert!(
            fs::read_dir(&outside)
                .expect("outside target should be readable")
                .next()
                .is_none(),
            "outside target must remain untouched"
        );
    }

    #[test]
    fn import_external_entry_rejects_directory_import_into_its_subtree() {
        let fixture = tempdir().expect("fixture should be created");
        let project = fixture.path().join("project");
        let target = project.join("game/scene");
        fs::create_dir_all(&target).expect("project subtree should be created");
        fs::write(project.join("game/config.txt"), "config")
            .expect("source content should be written");

        let error = import_external_entry_impl(&project, &target, "project", &project)
            .expect_err("directory import into its subtree should be rejected");

        assert!(matches!(error, AppError::Vfs(_)));
        assert!(!target.join("project").exists());
    }

    #[test]
    fn import_external_entry_rejects_source_links_and_rolls_back_directory() {
        let fixture = tempdir().expect("fixture should be created");
        let project = fixture.path().join("project");
        let target = project.join("game/background");
        let source = fixture.path().join("assets");
        let outside = fixture.path().join("outside");
        fs::create_dir_all(&target).expect("target should be created");
        fs::create_dir_all(&source).expect("source should be created");
        fs::create_dir_all(&outside).expect("outside directory should be created");
        fs::write(source.join("asset.txt"), "asset").expect("source file should be written");
        fs::write(outside.join("secret.txt"), "secret").expect("outside file should be written");
        create_dir_link(&outside, &source.join("linked"));

        let error = import_external_entry_impl(&source, &target, "assets", &project)
            .expect_err("source links should be rejected");

        assert!(matches!(error, AppError::Vfs(_)));
        assert!(
            !target.join("assets").exists(),
            "failed directory import must be removed completely"
        );
    }
}
