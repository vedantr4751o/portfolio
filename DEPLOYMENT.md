# Free Deployment With Global Admin Saves

This portfolio can run on Render's free web service plan. Admin saves are global
when the deployed server is configured to commit `data.json` back to GitHub.

Prepared GitHub owner: `Vedantr4751o`
Suggested repo name: `portfolio`

## 1. Push the Project to GitHub

Do not upload `node_modules`. GitHub should include:

- `server.js`
- `admin.html`
- `portfolio_template.html`
- `data.json`
- `package.json`
- `package-lock.json`
- `render.yaml`

## 2. Create a GitHub Token

Create a fine-grained GitHub personal access token with access to this one repo.
Give it Contents read/write permission so the admin panel can update `data.json`.

Keep this token secret. Do not commit it into the repo.

## 3. Deploy on Render

Create a new Render Web Service from the GitHub repo.

Use:

- Build command: `npm install`
- Start command: `npm start`
- Plan: `Free`

Set these environment variables in Render:

- `ADMIN_PASSWORD`: your admin panel password
- `GITHUB_TOKEN`: the GitHub token from step 2
- `GITHUB_REPO`: `Vedantr4751o/portfolio`
- `GITHUB_BRANCH`: `main`
- `GITHUB_DATA_PATH`: `data.json`

## 4. How Admin Saves Work

When you save in `/admin`, the server commits the new portfolio data to
`data.json` in GitHub. Render can then redeploy from that commit, and the live
site reads the same shared GitHub-backed data instead of saving only on your PC.

Without `GITHUB_TOKEN` and `GITHUB_REPO`, the app still works locally, but saves
only update the local `data.json` file.
