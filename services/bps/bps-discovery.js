const indicators = require("../../config/bps-indicators");
const { readRows, readPageInfo } = require("./bps-client");

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getVariableId(variable) {
  return variable?.var_id ?? variable?.val ?? variable?.variable_id ?? null;
}

function getVariableTitle(variable) {
  return variable?.title ?? variable?.label ?? variable?.name ?? "";
}

function getVariableNotes(variable) {
  return variable?.notes ?? variable?.note ?? "";
}

function getVariableSubject(variable) {
  return variable?.sub_name ?? variable?.subj ?? variable?.subject ?? null;
}

function variableText(variable) {
  return normalizeText([
    getVariableTitle(variable),
    variable.def,
    getVariableNotes(variable),
    getVariableSubject(variable),
    variable.unit,
  ].filter(Boolean).join(" "));
}

function matchesVariable(variable, keywords) {
  const text = variableText(variable);
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function verifyCandidate(variable, definition) {
  const text = variableText(variable);
  const keywordMatch = definition.keywords.some((keyword) => text.includes(normalizeText(keyword)));
  const unitMatch = !definition.expected_units?.length || definition.expected_units.some((unit) => normalizeText(variable.unit) === normalizeText(unit));
  const hasMetadata = Boolean(getVariableId(variable) && getVariableTitle(variable) && variable.unit);
  return {
    status: keywordMatch && unitMatch && hasMetadata ? "verified" : "candidate",
    checks: { keyword_match: keywordMatch, unit_match: unitMatch, metadata_complete: hasMetadata },
  };
}

function mapVariable(variable, definition, context = {}) {
  const verification = verifyCandidate(variable, definition);
  return {
    indicator_code: definition.indicator_code,
    indicator_name: definition.name,
    category: definition.category,
    variable_id: Number(getVariableId(variable)),
    title: getVariableTitle(variable),
    unit: variable.unit || null,
    definition: variable.def || "",
    note: getVariableNotes(variable),
    domain: String(context.domain || ""),
    subject_id: context.subject_id ? Number(context.subject_id) : null,
    subject: getVariableSubject(variable) || context.subject_title || null,
    status: verification.status,
    verification: verification.checks,
    source: "BPS",
    source_url: "https://webapi.bps.go.id/documentation/",
    discovered_at: new Date().toISOString(),
  };
}

async function listAllPages(loader, firstPayload, maxPages = 50) {
  const rows = [...readRows(firstPayload)];
  const info = readPageInfo(firstPayload);
  for (let page = 2; page <= Math.min(info.pages, maxPages); page += 1) {
    const payload = await loader(page);
    rows.push(...readRows(payload));
  }
  return rows;
}

async function discoverVariables(client, { domain = "0000", keyword, subjectId, year, maxPages = 50 }) {
  if (!keyword) throw new Error("Parameter keyword wajib diisi.");
  const definition = {
    indicator_code: "custom",
    name: keyword,
    category: "custom",
    keywords: String(keyword).split(",").map((item) => item.trim()).filter(Boolean),
    expected_units: [],
  };
  const first = await client.listVariables({ domain, subject: subjectId, year, page: 1, area: 1 });
  const variables = await listAllPages((page) => client.listVariables({ domain, subject: subjectId, year, page, area: 1 }), first, maxPages);
  return variables.filter((variable) => matchesVariable(variable, definition.keywords)).map((variable) => mapVariable(variable, definition, { domain, subject_id: subjectId }));
}

async function discoverIndicator(client, definition, { domain = "0000", year, maxPages = 50 } = {}) {
  const subjectsPayload = await client.listSubjects({ domain, page: 1 });
  const subjects = await listAllPages((page) => client.listSubjects({ domain, page }), subjectsPayload, maxPages);
  const results = [];
  for (const subject of subjects) {
    const variables = await discoverVariables(client, {
      domain,
      year,
      subjectId: subject.sub_id,
      keyword: definition.keywords.join(","),
      maxPages,
    });
    variables.forEach((variable) => results.push({ ...variable, indicator_code: definition.indicator_code, indicator_name: definition.name, category: definition.category, direction: definition.direction }));
  }
  return results;
}

async function discoverIndicatorCatalog(client, { domain = "0000", codes, year, maxPages = 50 } = {}) {
  const selected = codes?.length ? indicators.filter((item) => codes.includes(item.indicator_code)) : indicators;
  const output = [];
  for (const definition of selected) {
    const matches = await discoverIndicator(client, definition, { domain, year, maxPages });
    output.push({
      ...definition,
      candidate_variable_id: definition.candidate_variable_id ?? null,
      matches,
      status: matches.some((item) => item.status === "verified") ? "verified" : matches.length ? "candidate" : "missing",
      discovered_at: new Date().toISOString(),
    });
  }
  return output;
}

module.exports = { indicators, discoverVariables, discoverIndicator, discoverIndicatorCatalog, verifyCandidate };
