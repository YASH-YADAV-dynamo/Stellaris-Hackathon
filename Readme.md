#  Stellaris Hackathon

> **Organized by:** ElixirTech Community  
> **Repository:** [ElixirTechCommunity/Stellaris-Hackathon](https://github.com/ElixirTechCommunity/Stellaris-Hackathon)


## How to Submit Your Project

Follow these steps **carefully** to upload your project to this repository.

---

###  Step 1 – Fork This Repository

Click the **Fork** button at the top-right of this page to create your own copy of this repo.

---

###  Step 2 – Clone Your Fork Locally
```bash
git clone https://github.com/<your-username>/Stellaris-Hackathon.git
cd Stellaris-Hackathon
```

---

### Step 3 – Create Your Project Folder

Inside the repo, create a new folder using the format:
```
submissions/TeamName_ProjectName/
```

**Example:**
```
submissions/TeamNova_SmartBridge/
```

Place all your project files inside this folder.

---

###  Step 4 – Add a `README.md` Inside Your Folder

Your submission folder **must** include a `README.md` with the following structure:
```markdown
# SkewX — Orderbook Imbalance & Funding Arbitrage

## 👥 Team Name
SkewX

## 🧑‍💻 Team Members
| Name | Role | GitHub |
|------|------|--------|
| Yash | Full-stack | @yash2 |

## 💡 Problem Statement
Traders struggle to compare fragmented liquidity/funding signals across multiple perp venues in real time.  
SkewX solves this with a unified orderbook + funding dashboard and execution flow for Hyperliquid/HotStuff, helping users react faster to imbalance and funding arbitrage opportunities.

## 🛠️ Tech Stack
- Next.js 16, React 19, TypeScript
- Zustand for client state
- Chart.js / react-chartjs-2 for visualization
- Hyperliquid SDK and HotStuff TypeScript SDK for trade execution
- Node.js + Next API routes

## 🔗 Links
- **Live Demo:** [TBD]
- **Video Demo:** [TBD]
- **Presentation (PPT/PDF):** [TBD]

## 📸 Screenshots
- Add UI screenshots/GIF from:
  - Orderbook Imbalance dashboard
  - Funding Arbitrage screener
  - Trade execution modal

## 🚀 How to Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development server:
   ```bash
   npm run dev
   ```
3. Open:
   ```text
   http://localhost:3000
   ```
```

---

### Step 5 – Commit and Push Your Changes
```bash
git add .
git commit -m "Add submission: TeamName_ProjectName"
git push origin main
```

---

###  Step 6 – Open a Pull Request (PR)

1. Go to your forked repo on GitHub
2. Click **"Compare & pull request"**
3. Use this PR title format:  
   `[Submission] TeamName – ProjectName`
4. Fill in the PR description and click **"Create Pull Request"**

> ⚠️ **Only PRs following the correct format will be reviewed.**



---

<p align="center">Made with ❤️ by <strong>ElixirTech Community</strong></p>
