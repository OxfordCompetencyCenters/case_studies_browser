const fs = require('fs');
const path = require('path');
const https = require('https');

const landingPages = [
  {
    sector: 'AI in Education',
    url: 'https://oerc.ox.ac.uk/ai-centre/ai-in-education-case-studies',
    slugPrefix: '/ai-centre/ai-in-education-case-studies/'
  },
  {
    sector: 'AI in Research',
    url: 'https://oerc.ox.ac.uk/ai-centre/ai-in-research-case-studies',
    slugPrefix: '/ai-centre/ai-in-research-case-studies/'
  },
  {
    sector: 'AI in Professional Services',
    url: 'https://oerc.ox.ac.uk/ai-centre/ai-in-professional-services-case-studies',
    slugPrefix: '/ai-centre/ai-in-professional-services-case-studies/'
  }
];

const outputDir = path.join(__dirname, '..', 'case-study-summaries');
const jsonPath = path.join(outputDir, 'case-studies.json');
const dataJsPath = path.join(outputDir, 'case-studies-data.js');
const readmePath = path.join(outputDir, 'README.md');
const browserTaxonomyPath = path.join(outputDir, 'browser-taxonomy.md');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function decode(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2B;/g, '+')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeApostrophes(text) {
  return text.replace(/[’‘]/g, "'");
}

function splitNames(text) {
  return text
    .split(/\s+(?:and|&)\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function looksLikePersonName(text) {
  const normalized = normalizeApostrophes(text).trim();
  if (!normalized || /\b(Department|Faculty|School|College|University|Students|Project|Programme|Course)\b/.test(normalized)) {
    return false;
  }

  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}$/.test(normalized);
}

function extractContributorInfo(introText, paragraphs) {
  const contributorLine = introText || '';
  const names = [];
  let displayLine = '';

  if (contributorLine) {
    const lead = contributorLine.split(',')[0].trim();
    for (const candidate of splitNames(lead)) {
      if (looksLikePersonName(candidate)) names.push(candidate);
    }
    if (names.length) displayLine = contributorLine;
  }

  if (!names.length) {
    const fallbackParagraph = paragraphs[0] || '';
    const match = fallbackParagraph.match(/\bFor ([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}),/);
    if (match && looksLikePersonName(match[1])) {
      names.push(match[1]);
      displayLine = match[1];
    }
  }

  return {
    contributor_line: displayLine,
    people: unique(names)
  };
}

function titleToCategories(title, paragraphs, sector) {
  const haystack = `${title} ${paragraphs.join(' ')}`.toLowerCase();
  const categories = [];

  const rules = [
    ['teaching', 'teaching'],
    ['learning', 'learning support'],
    ['student', 'student support'],
    ['research', 'research workflow'],
    ['policy', 'policy implementation'],
    ['survey', 'survey analysis'],
    ['transcription', 'transcription'],
    ['ocr', 'ocr and extraction'],
    ['manuscript', 'digital humanities'],
    ['coding', 'coding support'],
    ['code', 'coding support'],
    ['communication', 'communications'],
    ['newsletter', 'communications'],
    ['review', 'draft review'],
    ['feedback', 'feedback'],
    ['accessibility', 'accessibility'],
    ['revision', 'revision support'],
    ['prototype', 'prototyping'],
    ['workflow', 'workflow improvement'],
    ['process', 'process improvement'],
    ['technical', 'technical troubleshooting'],
    ['404', 'technical troubleshooting'],
    ['ga4', 'analytics'],
    ['bias', 'bias auditing'],
    ['geographic', 'bias auditing'],
    ['asset', 'information management'],
    ['grant', 'grants administration'],
    ['audio', 'audio processing']
  ];

  for (const [needle, label] of rules) {
    if (haystack.includes(needle)) categories.push(label);
  }

  if (!categories.length) {
    categories.push(sector === 'AI in Education' ? 'education practice' : sector === 'AI in Research' ? 'research practice' : 'professional services practice');
  }

  return unique(categories).slice(0, 5);
}

function titleToTools(title, paragraphs) {
  const haystack = `${title} ${paragraphs.join(' ')}`;
  const tools = [];
  const patterns = [
    ['ChatGPT', /\bChatGPT\b/i],
    ['Gemini', /\bGemini\b/i],
    ['Microsoft Copilot', /\bMicrosoft Copilot\b/i],
    ['Codex', /\bCodex\b/i],
    ['NotebookLM', /\bNotebookLM\b/i]
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(haystack)) tools.push(label);
  }

  return unique(tools);
}

function titleToThemes(title, paragraphs) {
  const haystack = `${title} ${paragraphs.join(' ')}`.toLowerCase();
  const themes = [];
  const rules = [
    ['time', 'time savings'],
    ['verify', 'verification'],
    ['check', 'human review'],
    ['critical', 'critical use'],
    ['privacy', 'privacy'],
    ['secure', 'security'],
    ['scale', 'scalability'],
    ['socratic', 'socratic prompting'],
    ['prototype', 'rapid prototyping'],
    ['draft', 'draft refinement'],
    ['personal', 'personalization'],
    ['workflow', 'workflow redesign'],
    ['policy', 'context-rich prompting'],
    ['motivation', 'motivation'],
    ['research design', 'research-first approach']
  ];

  for (const [needle, label] of rules) {
    if (haystack.includes(needle)) themes.push(label);
  }

  return unique(themes).slice(0, 5);
}

function summarize(paragraphs) {
  const useful = paragraphs.filter((paragraph) => paragraph.length > 40 && !/^Key lessons included/i.test(paragraph));
  return useful.slice(0, 2).join(' ').slice(0, 500).trim();
}

function toBrowserUseCases(record) {
  const labels = [];
  const joined = `${record.title} ${record.categories.join(' ')} ${record.summary}`.toLowerCase();

  if (/(teaching|learning|student support|revision|feedback|accessibility|clinical communication)/.test(joined)) {
    labels.push('Teaching, Learning & Assessment');
  }
  if (/(research workflow|digital humanities|bias auditing|transcription|ocr and extraction)/.test(joined)) {
    labels.push('Research & Scholarship');
  }
  if (/(communications|draft review|policy implementation|information management|grants administration|process improvement|workflow improvement)/.test(joined)) {
    labels.push('Administration & Operations');
  }
  if (/(coding support|prototype|prototyping|python|javascript|tool|builder)/.test(joined)) {
    labels.push('Coding, Automation & Tool Building');
  }
  if (/(survey analysis|analytics|draft review|feedback|decision|review)/.test(joined)) {
    labels.push('Analysis, Review & Decision Support');
  }
  if (/(communication|newsletter|writing|translation|podcast|draft|content)/.test(joined)) {
    labels.push('Writing, Communication & Content');
  }
  if (/(search|knowledge|manuscript|ecological data|reading list|guide bot|discover|catalogue)/.test(joined)) {
    labels.push('Search, Knowledge Access & Discovery');
  }

  return unique(labels).slice(0, 3);
}

function toBrowserAiRoles(record) {
  const labels = [];
  const joined = `${record.title} ${record.summary} ${record.source_paragraphs.join(' ')}`.toLowerCase();

  if (/(socratic|tutor|coach|student|revision|practice|simulated patient)/.test(joined)) {
    labels.push('Tutoring & Coaching');
  }
  if (/(draft|rewrite|editing|summary|newsletter|communication|podcast|translation)/.test(joined)) {
    labels.push('Drafting & Editing');
  }
  if (/(analy|review|feedback|critical friend|evaluate|survey|insight)/.test(joined)) {
    labels.push('Analysis & Review');
  }
  if (/(code|coding|build|prototype|pipeline|app|bot|tool|automation)/.test(joined)) {
    labels.push('Coding & Building');
  }
  if (/(guide bot|reading list|search|catalogue|knowledge|question|assistant)/.test(joined)) {
    labels.push('Search & Knowledge');
  }
  if (/(workflow|process|scale|automated|batch|self-service)/.test(joined)) {
    labels.push('Workflow Automation');
  }

  return unique(labels).slice(0, 3);
}

function toBrowserAudience(record) {
  const joined = `${record.title} ${record.summary} ${record.source_paragraphs.join(' ')}`.toLowerCase();
  const labels = [];

  if (/(student|undergraduate|postgraduate|foundation year|learner)/.test(joined)) labels.push('Students');
  if (/(teacher|teaching|educator|tutor|classroom|course)/.test(joined)) labels.push('Educators');
  if (/(research|researcher|manuscript|scholarship|qualitative)/.test(joined)) labels.push('Researchers');
  if (record.sector === 'AI in Professional Services' || /(staff|departmental|stakeholder|policy|administrative)/.test(joined)) labels.push('Professional Services Staff');

  if (!labels.length) {
    labels.push(record.sector === 'AI in Education' ? 'Educators' : record.sector === 'AI in Research' ? 'Researchers' : 'Professional Services Staff');
  }

  return unique(labels).slice(0, 3);
}

function toBrowserGuardrails(record) {
  const joined = `${record.summary} ${record.source_paragraphs.join(' ')}`.toLowerCase();
  const labels = [];

  if (/(check|checked|review|reviewed|human eyes|quality assurance|human in the loop|verify)/.test(joined)) {
    labels.push('Human review required');
  }
  if (/(accuracy|hallucinat|mistake|incorrect|outdated|limitations|not reliable)/.test(joined)) {
    labels.push('Accuracy limitations');
  }
  if (/(privacy|secure|sensitive|gdpr|data privacy|information security)/.test(joined)) {
    labels.push('Privacy or security sensitive');
  }
  if (/(academic integrity|pedagogical|shortcut|own thinking|assessment|trust the output)/.test(joined)) {
    labels.push('Pedagogical or integrity concerns');
  }

  return unique(labels).slice(0, 3);
}

function countFacet(records, key) {
  const map = new Map();
  for (const record of records) {
    for (const value of record[key]) {
      map.set(value, (map.get(value) || 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderBrowserTaxonomy(records) {
  const lines = [];
  lines.push('# Recommended Browser Taxonomy');
  lines.push('');
  lines.push('This is a smaller, browser-oriented facet set derived from the full case study corpus. It is intended to replace or sit alongside the noisier raw `categories` and `key_themes` fields.');
  lines.push('');
  lines.push('## Recommended facets');
  lines.push('');
  lines.push('- `sector`: broad institutional context');
  lines.push('- `browser_use_cases`: what the case study is mainly for');
  lines.push('- `browser_ai_roles`: how the AI behaves in the workflow');
  lines.push('- `browser_audience`: who benefits most directly');
  lines.push('- `browser_guardrails`: what caveats matter when browsing examples');
  lines.push('- `tools`: keep as a secondary filter, but grouped or deduped in the UI');
  lines.push('');

  const facetKeys = [
    ['browser_use_cases', 'Use Cases'],
    ['browser_ai_roles', 'AI Roles'],
    ['browser_audience', 'Audience'],
    ['browser_guardrails', 'Guardrails']
  ];

  for (const [key, label] of facetKeys) {
    lines.push(`## ${label}`);
    lines.push('');
    for (const [name, total] of countFacet(records, key)) {
      lines.push(`- ${name}: ${total}`);
    }
    lines.push('');
  }

  lines.push('## Suggested UI approach');
  lines.push('');
  lines.push('- Put `sector` and `browser_use_cases` first. They will do most of the navigation work.');
  lines.push('- Keep `tools` as an optional advanced filter, because tool names are less stable than workflow patterns.');
  lines.push('- Show `browser_ai_roles` and `browser_guardrails` as badges on cards rather than mandatory filters.');
  lines.push('- Use raw `categories` only as hidden metadata or search terms, not as top-level chips.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function collectLinks(landing) {
  const links = new Set();
  let stagnantPages = 0;

  for (let page = 1; page <= 12; page += 1) {
    const html = await fetchHtml(`${landing.url}?page=${page}`);
    const matches = html.match(new RegExp(`${landing.slugPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]+`, 'g')) || [];
    const pageLinks = unique(matches).map((item) => `https://oerc.ox.ac.uk${item}`);
    const before = links.size;

    for (const link of pageLinks) {
      links.add(link);
    }

    if (links.size === before) {
      stagnantPages += 1;
    } else {
      stagnantPages = 0;
    }

    if (stagnantPages >= 2) break;
  }

  return [...links].sort();
}

async function extractCaseStudy(sector, url) {
  const html = await fetchHtml(url);
  const titleMatch = html.match(/<h1 class="profilebanner-name">([\s\S]*?)<\/h1>/);
  const introMatch = html.match(/<p class="casestudypage-intro[^"]*">([\s\S]*?)<\/p>/);
  const blockMatch = html.match(/<div class="usercontent">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  const title = titleMatch ? decode(titleMatch[1]) : path.basename(url);
  const intro = introMatch ? decode(introMatch[1]) : '';
  const block = blockMatch ? blockMatch[1] : '';
  const paragraphs = [...block.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((match) => decode(match[2]))
    .filter(Boolean)
    .filter((paragraph) => !/^Should you wish to discuss/i.test(paragraph));
  const contributorInfo = extractContributorInfo(intro, paragraphs);

  return {
    title,
    sector,
    url,
    contributor_line: contributorInfo.contributor_line,
    people: contributorInfo.people,
    tools: titleToTools(title, paragraphs),
    categories: titleToCategories(title, paragraphs, sector),
    key_themes: titleToThemes(title, paragraphs),
    summary: summarize(paragraphs),
    source_paragraphs: paragraphs
  };
}

function renderReadme(records) {
  const lines = [];
  lines.push('# Oxford AI Centre Case Study Summaries');
  lines.push('');
  lines.push('Source pages reviewed on March 12, 2026 using paginated extraction (`?page=N`) until no new case study links appeared.');
  lines.push('');
  lines.push('This digest summarizes every individual case study page discovered from the three landing pages. The machine-readable dataset is available in [case-studies.json](./case-studies.json).');
  lines.push('');

  for (const landing of landingPages) {
    lines.push(`## ${landing.sector}`);
    lines.push('');
    for (const record of records.filter((item) => item.sector === landing.sector)) {
      lines.push(`### ${record.title}`);
      lines.push(`- URL: \`${record.url}\``);
      if (record.contributor_line) {
        lines.push(`- Contributor: ${record.contributor_line}`);
      }
      lines.push(`- Tools: ${record.tools.length ? record.tools.map((tool) => `\`${tool}\``).join(', ') : '`None detected`'}`);
      lines.push(`- Categories: ${record.categories.map((category) => `\`${category}\``).join(', ')}`);
      lines.push(`- Key themes: ${record.key_themes.length ? record.key_themes.map((theme) => `\`${theme}\``).join(', ') : '`None detected`'}`);
      lines.push(`- Summary: ${record.summary}`);
      lines.push('');
    }
  }

  lines.push('## Counts');
  lines.push('');
  for (const landing of landingPages) {
    const count = records.filter((item) => item.sector === landing.sector).length;
    lines.push(`- ${landing.sector}: ${count}`);
  }
  lines.push(`- Total: ${records.length}`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const allRecords = [];

  for (const landing of landingPages) {
    const links = await collectLinks(landing);
    for (const link of links) {
      const record = await extractCaseStudy(landing.sector, link);
      record.browser_use_cases = toBrowserUseCases(record);
      record.browser_ai_roles = toBrowserAiRoles(record);
      record.browser_audience = toBrowserAudience(record);
      record.browser_guardrails = toBrowserGuardrails(record);
      allRecords.push(record);
    }
  }

  allRecords.sort((a, b) => a.sector.localeCompare(b.sector) || a.title.localeCompare(b.title));

  fs.writeFileSync(jsonPath, JSON.stringify(allRecords, null, 2));
  fs.writeFileSync(dataJsPath, `window.CASE_STUDIES_DATA = ${JSON.stringify(allRecords, null, 2)};\n`);
  fs.writeFileSync(readmePath, renderReadme(allRecords));
  fs.writeFileSync(browserTaxonomyPath, renderBrowserTaxonomy(allRecords));

  console.log(`Wrote ${allRecords.length} case studies`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
