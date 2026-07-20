const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const TEMPLATE_FILE = path.join(__dirname, 'portfolio_template.html');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_DATA_PATH = process.env.GITHUB_DATA_PATH || 'data.json';
const USE_GITHUB_STORAGE = Boolean(GITHUB_TOKEN && GITHUB_REPO);

// Seed an alternate local data file by copying the bundled data.json, without
// overwriting existing data.
const SEED_FILE = path.join(__dirname, 'data.json');
if (DATA_FILE !== SEED_FILE && !fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.copyFileSync(SEED_FILE, DATA_FILE);
    console.log(`Seeded ${DATA_FILE} from ${SEED_FILE}`);
}

app.use(express.json());

// Enable CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Admin-Password');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

function isAuthorized(req) {
    return req.headers['x-admin-password'] === ADMIN_PASSWORD;
}

async function githubRequest(apiPath, options = {}) {
    const response = await fetch(`https://api.github.com${apiPath}`, {
        ...options,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'portfolio-admin-panel',
            ...(options.headers || {})
        }
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(body.message || `GitHub API error ${response.status}`);
    }
    return body;
}

async function readPortfolioData() {
    if (USE_GITHUB_STORAGE) {
        const file = await githubRequest(
            `/repos/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_DATA_PATH)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
        );
        return Buffer.from(file.content, 'base64').toString('utf8');
    }
    return fs.promises.readFile(DATA_FILE, 'utf8');
}

async function savePortfolioData(updatedData) {
    const serialized = JSON.stringify(updatedData, null, 2) + '\n';

    if (USE_GITHUB_STORAGE) {
        const filePath = encodeURIComponent(GITHUB_DATA_PATH);
        const current = await githubRequest(
            `/repos/${GITHUB_REPO}/contents/${filePath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
        );

        await githubRequest(`/repos/${GITHUB_REPO}/contents/${filePath}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Update portfolio data from admin panel',
                content: Buffer.from(serialized, 'utf8').toString('base64'),
                sha: current.sha,
                branch: GITHUB_BRANCH
            })
        });
        return;
    }

    await fs.promises.writeFile(DATA_FILE, serialized, 'utf8');
}

app.get('/api/auth', (req, res) => {
    if (!isAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized. Invalid password." });
    }
    res.json({ ok: true });
});

// Route to get the portfolio data
app.get('/api/portfolio', async (req, res) => {
    try {
        res.json(JSON.parse(await readPortfolioData()));
    } catch (err) {
        console.error("Error reading portfolio data:", err);
        res.status(500).json({ error: "Failed to read database." });
    }
});

// Route to save updated portfolio data
app.post('/api/portfolio', async (req, res) => {
    if (!isAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized. Invalid password." });
    }

    const updatedData = req.body;
    if (!updatedData || typeof updatedData !== 'object') {
        return res.status(400).json({ error: "Invalid data format." });
    }

    try {
        await savePortfolioData(updatedData);
        res.json({
            message: USE_GITHUB_STORAGE
                ? "Portfolio saved successfully and committed to GitHub."
                : "Portfolio saved successfully."
        });
    } catch (err) {
        console.error("Error saving portfolio data:", err);
        res.status(500).json({ error: "Failed to save database." });
    }
});

// Serve dynamically compiled portfolio page
function serveDynamicPortfolio(req, res) {
    readPortfolioData()
        .then((jsonData) => {
            fs.readFile(TEMPLATE_FILE, 'utf8', (err, htmlTemplate) => {
            if (err) {
                return res.status(500).send("Template Error");
            }
            
            try {
                const data = JSON.parse(jsonData);
                const shortName = data.personal.fullName.split(' ').slice(0, 2).join(' ').toUpperCase();
                
                // Set up exact replacements mapping
                const replacements = {
                    '__PAGE_TITLE__': data.personal.fullName + " — Portfolio",
                    '__FULL_NAME__': JSON.stringify(data.personal.fullName),
                    '__EMAIL_0__': JSON.stringify(data.contact.emails[0] || ''),
                    '__EMAIL_1__': JSON.stringify(data.contact.emails[1] || ''),
                    '__PHONE_0__': JSON.stringify(data.contact.phones[0] || ''),
                    '__PHONE_1__': JSON.stringify(data.contact.phones[1] || ''),
                    '__LINKEDIN__': JSON.stringify(data.contact.linkedin),
                    '__GITHUB__': JSON.stringify(data.contact.github),
                    '__CGPA_ENTC__': JSON.stringify(data.personal.cgpa + " CGPA • ENTC"),
                    '__PROFILE_TEXT__': JSON.stringify(data.personal.profileText),
                    '__LANGUAGES_ARRAY__': JSON.stringify(data.personal.languages.split(',').map(s => s.trim())),
                    '__SKILLS_SUBTEXT__': JSON.stringify(data.skills.list.join(' • ')),
                    '__SKILLS_ARRAY__': JSON.stringify(data.skills.list),
                    '__SKILLS_CATEGORIES__': JSON.stringify(data.skills.categories),
                    '__EDUCATION_ARRAY__': JSON.stringify(data.education),
                    
                    '__PERSONAL_DETAILS_ARRAY__': JSON.stringify([
                        ["Full Name", data.personal.fullName],
                        ["DOB", data.personal.dob],
                        ["Gender", data.personal.gender],
                        ["Marital Status", data.personal.maritalStatus],
                        ["Current Address", data.personal.currentAddress],
                        ["Permanent", data.personal.permanentAddress],
                        ["Languages", data.personal.languages],
                        ["Title", data.personal.title]
                    ]),
                    
                    // Project 0
                    '__PROJ_0_META__': JSON.stringify(
                        `${data.projects[0].duration} • Team Size ${data.projects[0].teamSize}${data.projects[0].role ? ' • ' + data.projects[0].role : ''}`
                    ),
                    '__PROJ_0_TITLE_PART1__': JSON.stringify(data.projects[0].title + " –"),
                    '__PROJ_0_TITLE_PART2__': JSON.stringify(data.projects[0].subtitle.split(' ').slice(0, 2).join(' ')),
                    '__PROJ_0_TITLE_PART3__': JSON.stringify(data.projects[0].subtitle.split(' ').slice(2).join(' ')),
                    '__PROJ_0_GITHUB__': JSON.stringify(data.projects[0].github),
                    '__PROJ_0_TECH_ARRAY__': JSON.stringify(data.projects[0].tech),
                    '__PROJ_0_DETAILS_ARRAY__': JSON.stringify(data.projects[0].details),
                    '__PROJ_0_METRIC_1_VAL__': JSON.stringify(Object.values(data.projects[0].metrics)[0] || ''),
                    '__PROJ_0_METRIC_1_NAME__': JSON.stringify(Object.keys(data.projects[0].metrics)[0] || ''),
                    '__PROJ_0_METRIC_2_VAL__': JSON.stringify(Object.values(data.projects[0].metrics)[1] || ''),
                    '__PROJ_0_METRIC_2_NAME__': JSON.stringify(Object.keys(data.projects[0].metrics)[1] || ''),
                    '__PROJ_0_METRIC_3_VAL__': JSON.stringify(Object.values(data.projects[0].metrics)[2] || '3 Roles'),
                    '__PROJ_0_METRIC_3_NAME__': JSON.stringify(Object.keys(data.projects[0].metrics)[2] || 'Patient Doctor Admin'),
                    '__PROJ_0_ARCH__': JSON.stringify(data.projects[0].architecture || ''),
                    '__PROJ_0_LINK_TEXT__': JSON.stringify(data.projects[0].github.replace('https://', '')),

                    // Project 1
                    '__PROJ_1_META__': JSON.stringify(
                        `${data.projects[1].duration} • Team Size ${data.projects[1].teamSize}${data.projects[1].role ? ' • ' + data.projects[1].role : ''}`
                    ),
                    '__PROJ_1_TITLE_PART1__': JSON.stringify(data.projects[1].title + " –"),
                    '__PROJ_1_TITLE_PART2__': JSON.stringify(data.projects[1].subtitle),
                    '__PROJ_1_TECH_ARRAY__': JSON.stringify(data.projects[1].tech),
                    '__PROJ_1_DETAILS_ARRAY__': JSON.stringify(data.projects[1].details),
                    '__PROJ_1_GITHUB__': JSON.stringify(data.projects[1].github),
                    '__PROJ_1_IMPACT_TEXT__': JSON.stringify(
                        `${data.projects[1].metrics.listings || data.projects[1].metrics.dailyBookings || ''} • ${data.projects[1].metrics.efficiency || data.projects[1].metrics.timeReduction || ''}`
                    ),
                    '__PROJ_1_LINK_TEXT__': JSON.stringify(data.projects[1].github.replace('https://', '')),

                    // Certifications
                    '__CERT_0_TITLE__': JSON.stringify(data.certifications[0] ? data.certifications[0].title : ''),
                    '__CERT_0_DESC__': JSON.stringify(data.certifications[0] ? data.certifications[0].desc : ''),
                    '__CERT_1_TITLE__': JSON.stringify(data.certifications[1] ? data.certifications[1].title : ''),
                    '__CERT_1_DESC__': JSON.stringify(data.certifications[1] ? data.certifications[1].desc : ''),
                    '__CERT_1_SKILLS_ARRAY__': JSON.stringify(data.certifications[1] ? data.certifications[1].skills || [] : []),

                    // Leadership
                    '__LEAD_0_TITLE__': JSON.stringify(data.leadership[0] ? data.leadership[0].title : ''),
                    '__LEAD_0_DESC__': JSON.stringify(data.leadership[0] ? data.leadership[0].desc : ''),
                    '__LEAD_0_SKILLS_ARRAY__': JSON.stringify(data.leadership[0] ? data.leadership[0].skills : []),
                    '__LEAD_1_TITLE__': JSON.stringify(data.leadership[1] ? data.leadership[1].title : ''),
                    '__LEAD_1_DESC__': JSON.stringify(data.leadership[1] ? data.leadership[1].desc : ''),
                    '__LEAD_1_SKILLS_ARRAY__': JSON.stringify(data.leadership[1] ? data.leadership[1].skills : []),

                    // Hobbies
                    '__HOBBIES_ARRAY__': JSON.stringify(data.hobbies),

                    // Header/Footer Brand names
                    '__HEADER_TITLE__': JSON.stringify(data.personal.fullName + " — " + new Date().getFullYear() + " — MERN"),
                    '__FOOTER_BRAND__': JSON.stringify(shortName + " • PORTFOLIO"),
                    '__FOOTER_COPYRIGHT__': `["${shortName}", v("br", {}), "PORTFOLIO • FINAL"]`
                };

                let outputHtml = htmlTemplate;
                for (const [placeholder, val] of Object.entries(replacements)) {
                    outputHtml = outputHtml.split(placeholder).join(val);
                }

                res.send(outputHtml);
            } catch (err) {
                console.error("Rendering Error:", err);
                res.status(500).send("Rendering Error: " + err.message);
            }
        });
        })
        .catch((err) => {
            console.error("Database Error:", err);
            res.status(500).send("Database Error");
        });
}

// Redirect default portfolio name to root or dynamic rendering
app.get('/Kanchan-Rajput-—-Portfolio.html', serveDynamicPortfolio);
app.get('/Kanchan-Rajput-%E2%80%94-Portfolio.html', serveDynamicPortfolio);

// Default fallback to serve portfolio page
app.get('/', serveDynamicPortfolio);

// Admin panel route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve other static files (like PDFs, bundle resources)
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Portfolio Server running at http://localhost:${PORT}`);
    console.log(`Admin Panel available at http://localhost:${PORT}/admin`);
});
