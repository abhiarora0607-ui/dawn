# Getting Dawn live — 3 commands

Run these in the `dawn` folder. Replace nothing except confirming your GitHub username is abhiarora0607-ui.

## 1. Create the repo on GitHub
Go to https://github.com/new
- Repository name: dawn
- Keep it Public (or Private, your choice)
- Do NOT add a README (we have one)
- Click "Create repository"

## 2. Push the code
```bash
cd dawn
git init
git add .
git commit -m "Dawn MVP — landing page + live briefing demo"
git branch -M main
git remote add origin https://github.com/abhiarora0607-ui/dawn.git
git push -u origin main
```
(GitHub will ask you to log in / paste a Personal Access Token the first time.)

## 3. Deploy on Vercel
- Go to https://vercel.com and sign in with GitHub (free)
- Click "Add New… → Project"
- Import the `dawn` repo
- Click "Deploy"
- ~60 seconds later you have a live URL.

That URL is the first thing you can send to anyone. Done.
