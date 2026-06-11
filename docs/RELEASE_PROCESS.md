# Release Process

When releasing a new version:

1. Update version references:
   - `package.json`
   - backend package version
   - frontend package version
   - settings page version
   - CLI version
   - installer version
   - README version

2. Generate `CHANGELOG` entry.

3. Create git tag.
   - Example: `v1.0.1`

4. Push tag to GitHub.

5. Create GitHub Release.
   - Release title: `HMPanel v1.0.1`

6. Generate release notes automatically from commits.

7. Verify `update.sh` upgrades correctly from previous version.

8. Verify database migrations are backward compatible.

9. Never require reinstall for normal updates.

10. Existing installations must be upgradeable using:
    - `hmpanel update`
    - or `update.sh`
