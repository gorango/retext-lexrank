# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/gorango/retext-lexrank/compare/v1.3.1...v1.4.0) (2026-04-26)


### Features

* add configurable and balanced chunked lexrank scoring ([96678de](https://github.com/gorango/retext-lexrank/commit/96678de7b8ab25622d67b85f223bc5f07109eee8))


### Bug Fixes

* add convergence-based stopping for lexrank power iteration ([dd7e342](https://github.com/gorango/retext-lexrank/commit/dd7e342e80287e973c010e897f56ac99e8101056))
* align sentence scoring and assignment traversal ([c01f149](https://github.com/gorango/retext-lexrank/commit/c01f149b5a57b4b798e180f6dd89445bf9e506a0))
* correct min-max normalization in lexrank scoring ([aed751a](https://github.com/gorango/retext-lexrank/commit/aed751a04f311ab060c76b91c5b3e4d13d4ff082))
* correct tanimoto denominator for Jaccard similarity ([7aa8ffd](https://github.com/gorango/retext-lexrank/commit/7aa8ffd75471b98310a302cf352524d9f530a08e))
* use word count for short sentence lexrank threshold ([28ce5e3](https://github.com/gorango/retext-lexrank/commit/28ce5e3c1a8cbca3e9fc00ba68939eaa7d7b0c91))

### [1.3.1](https://github.com/gorango/retext-lexrank/compare/v1.3.0...v1.3.1) (2024-09-07)

## [1.3.0](https://github.com/gorango/retext-lexrank/compare/v1.2.2...v1.3.0) (2024-08-26)


### Features

* add types ([f6a9138](https://github.com/gorango/retext-lexrank/commit/f6a9138abe21c257ccdc3335937dfb0d4ccaf8e0))

### [1.2.2](https://github.com/gorango/retext-lexrank/compare/v1.2.1...v1.2.2) (2022-12-04)


### Bug Fixes

* exclude short sentences ([#9](https://github.com/gorango/retext-lexrank/issues/9)) ([507cebe](https://github.com/gorango/retext-lexrank/commit/507cebe550eee3a3f52b04450dcef26fc9a9ffa0))

### [1.2.1](https://github.com/gorango/retext-lexrank/compare/v1.2.0...v1.2.1) (2022-10-21)


### Bug Fixes

* semantics ([cfaf3f1](https://github.com/gorango/retext-lexrank/commit/cfaf3f17c23a6a1fdbad87b6843506aed630a6c8))

## [1.2.0](https://github.com/gorango/retext-lexrank/compare/v1.1.0...v1.2.0) (2021-10-15)


### Features

* store word stems in WordNodes data ([7eb4754](https://github.com/gorango/retext-lexrank/commit/7eb4754b187d9de4a43b76392ca5f5f928f5450e))

## [1.1.0](https://github.com/gorango/retext-lexrank/compare/v1.0.2...v1.1.0) (2021-10-03)


### Features

* more granular scoring for larger texts ([5f48fb9](https://github.com/gorango/retext-lexrank/commit/5f48fb9568e08bd065ee32fc2d3688c02ff16645))


### Bug Fixes

* null weights returned by `normalize` ([42322fa](https://github.com/gorango/retext-lexrank/commit/42322fa1238a6d6a1d09ae32212088317c6cc702)), closes [#8](https://github.com/gorango/retext-lexrank/issues/8)

### [1.0.2](https://github.com/gorango/retext-lexrank/compare/v1.0.1...v1.0.2) (2021-09-26)

### [1.0.1](https://github.com/gorango/retext-lexrank/compare/v1.0.0...v1.0.1) (2021-09-26)

### [1.0.0](https://github.com/gorango/retext-lexrank/compare/v1.0.0...v1.0.1) (2021-07-24)

### [0.0.2](https://github.com/gorango/retext-lexrank/compare/v0.0.1...v0.0.2) (2020-02-11)

### Bug Fixes

- **core:** empty sentences break ranks ([b09603d](https://github.com/gorango/retext-lexrank/commit/b09603d948071adf7029a3439061227c4f2e27a0))
