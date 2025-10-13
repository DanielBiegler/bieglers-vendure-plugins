# Changelog

Format:

- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.

## 1.1.0

### Added

- QuickPick menu now displays icons beside results
- Mention changelog and localization support in `README.md`
- New image showing the search menu in `README.md` and extension bundle

### Changes

- Optimize search logic by reducing amount of function calls for if item has no detail or description
- If the description of the link is just the label, don't show it separately

### Fixed

- Relative URLs and Images now work correctly when opening the extension in VS Code and perusing the displayed `README.md`

## 1.0.0

### Added

- Shortcut for opening the QuickPick Menu `CTRL+K V` (`CMD+K V` on Mac)
- Translation Support for messages, tooltips, etc. and provide:
  - English
  - German
  - Russian

## 0.3.0

### Added

- Ability to copy the URL of the highlighted item either via button or pressing CTRL+C directly

## 0.2.1

### Fixed

- In 0.2.0 the option to use the direct search accidently disappeared. Now it's available again.

## 0.2.0

### Added

- "Recently picked"-Section on top displaying your last picked items

### Changed

- Improved error message for when the docs-fetching fails

## 0.1.0

### Added

- Command for searching Vendure Docs

