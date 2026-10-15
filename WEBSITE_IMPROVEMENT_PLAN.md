# Website improvement plan

Scope: `https://hub.cblum.ch` (Moodle Question Hub Marketplace). This is a planning document; no application changes or deployment are part of it. Findings were checked on 14 October 2026.

## 1. Preserve and finish the current feature work

- The local checkout is on `feature/private-package-access`. Its two commits are ahead of `main`; GitHub has no open pull request for them. Review the branch, run the required build and live verification, then open a PR and merge it into `main` if the access model is approved.
- `feature/preview-flag-withdraw-oauth-fixes` is already an ancestor of `main` (GitHub comparison: zero commits ahead). It can be deleted after confirming nobody still uses it.
- Preserve the existing uncommitted changes in `AGENTS.md`, `PackageSettings.tsx`, `DashboardPage.tsx`, and the new `PackageEditForm.tsx`. They consolidate the package editor and are relevant to the Kursstufe change. Review and finish them before merging or switching branches; do not overwrite them.
- The current feature branch intentionally lists private packages with limited metadata so teachers can request access. Keep that policy unless the product decision changes. Verify that the API reveals only intended fields and that the catalogue and detail page show a clear access request instead of unusable preview or download actions.

## 2. Make Kursstufe editable in package settings

- Add a labelled **Kursstufe** select to the shared `PackageEditForm.tsx`, with `GF`, `SF`, `EF`, and `FF` and their full German names. Keep it distinct from the existing `GYM1`–`GYM4` **Zielstufen** checkboxes.
- Initialise the value from `pkg.taxonomy?.subject_category`, falling back to `pkg.subject_category` for the account package list. Include `subject_category` in the `api.updatePackage` payload. The existing PATCH route and service already accept and validate this field; confirm that no backend change is needed.
- After saving, refresh both the package detail and account views. Confirm the selected value persists after reload and appears in the catalogue/detail metadata and Kursstufe filter.
- Add a focused test for changing `GF` to `SF`, including a rejected invalid value and an unchanged release/version. Follow the repository's required build and live verification workflow when implementing.

## 3. Clarify the catalogue and first visit

- Give the available packages and the two main teacher tasks (find/import and publish/share) more prominence than the large generic hero. Show a concrete example and a short explanation of the Moodle import path.
- The public API currently returns one package, which is private and has no published release. Make that state explicit; do not present it as a downloadable collection. Keep search and filters available, but reduce their visual weight until the catalogue has enough accessible content to browse.
- Use the API's `pagination.total` rather than the current page length for the results count. Add pagination when results exceed one page.
- Distinguish loading, no results, request failure, private access, and no released version. Preserve filters on retry and prevent older concurrent search responses from replacing newer results.

## 4. Make claims and package evidence precise

- Replace “geprüfte Fragensammlungen” with a claim that matches the actual process, or add a documented human review workflow with visible review status. XML validation alone does not establish pedagogical review.
- Replace the hard-coded “fully tested” Moodle compatibility and “no external plugin dependencies” statements on every package with package-specific evidence. Show supported question types, required plugins, tested Moodle versions, and the date/method of the test when available. Otherwise use a narrower statement.
- Explain what the protected preview hides and what a teacher receives after access is granted, without exposing answer keys or private question content.

## 5. Polish the interaction and visual system

- Audit the rendered desktop and mobile pages. Reduce repeated card, badge, shadow, icon, and gradient treatments where they do not help scanning; establish a consistent type and spacing hierarchy around package title, subject, Kursstufe, question count, access state, and primary action.
- Check keyboard order, visible focus, form labels, contrast, responsive layouts, and error recovery against WCAG 2.2 AA. Test the catalogue, package details, registration, access request, upload, and settings flows with representative teachers.
- Measure LCP, INP, and CLS on the live site and fix any failing Core Web Vitals after the workflow issues above are resolved.

## Completion criteria

- No private package question content or unintended metadata is exposed to unauthorised visitors; the public view offers a working access request path.
- An owner can change Kursstufe in either settings entry point and see the value persist everywhere it is displayed or filtered.
- The catalogue never presents an action that the current visitor cannot complete, and its result count and error states are accurate.
- Trust and compatibility statements have evidence or have been revised.
- The feature branch is reviewed and merged through a green PR; the already merged branch is retired. Production changes are built, backed up, deployed, and verified under `AGENTS.md`.
