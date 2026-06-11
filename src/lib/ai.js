// AI extraction using Claude Haiku via OpenAI-compatible endpoint
// For now we use a serverless function. This file prepares the prompt.

export function buildExtractionPrompt(text, projectNames) {
  return {
    system: `You extract structured project data from Greek or English construction office notes. 
Active projects: ${projectNames.join(', ')}
Return ONLY valid JSON, no markdown, no explanation.
JSON format: {"project_name":"must match one from list","people":[],"deadline_description":"","deadline_date":"YYYY-MM-DD or null","budget_change":0,"action_items":[],"summary":"1-2 sentence summary in Greek"}`,
    user: text
  }
}

export function buildSummaryPrompt(entries, projectName) {
  const recent = entries.slice(0, 10).map(e => 
    `[${e.created_at?.split('T')[0]}] ${e.entry_type}: ${e.ai_summary || e.raw_text || e.file_name || ''}`
  ).join('\n')
  
  return {
    system: `You summarize construction project status in Greek. Be concise, 3-4 sentences max. Mention deadlines, budget changes, and pending items.`,
    user: `Project: ${projectName}\nΤελευταίες ενημερώσεις:\n${recent}\n\nΓράψε σύνοψη στα ελληνικά.`
  }
}
