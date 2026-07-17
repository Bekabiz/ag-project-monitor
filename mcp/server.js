import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createServer } from 'http';

// ============================================
// AG Project Monitor MCP Server
// 11 tools for Giorgos to control his office from Claude
// ============================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: find profile by name (fuzzy Greek match)
async function findProfile(name) {
  const { data: profiles } = await supabase.from('profiles').select('*');
  if (!profiles) return null;
  const lower = name.toLowerCase();
  return profiles.find(p =>
    p.full_name?.toLowerCase().includes(lower) ||
    lower.includes(p.full_name?.split(' ')[0]?.toLowerCase() || '')
  );
}

// Helper: find project by name (fuzzy Greek match)
async function findProject(name) {
  const { data: projects } = await supabase.from('projects').select('*').eq('status', 'active');
  if (!projects) return null;
  const lower = name.toLowerCase();
  return projects.find(p =>
    p.name?.toLowerCase().includes(lower) ||
    lower.includes(p.name?.toLowerCase() || '')
  );
}

// Helper: get owner profile
async function getOwner() {
  const { data } = await supabase.from('profiles').select('*').eq('role', 'owner').limit(1);
  return data?.[0] || null;
}

// ============================================
// Tool registration function
// Called per-session for SSE, or once for stdio
// ============================================

function registerAllTools(server) {

// ============================================
// TOOL 1: create_task
// "Δώσε εργασία στη Βάσω: έλεγξε τον σωλήνα μέχρι Παρασκευή"
// ============================================
server.tool(
  'create_task',
  'Δημιουργία νέας εργασίας. Αντιστοιχίζει αυτόματα πρόσωπα και έργα από ελληνικά ονόματα.',
  {
    title: z.string().describe('Τίτλος εργασίας (π.χ. "Έλεγξε τον σωλήνα στο μπάνιο")'),
    assignee: z.string().describe('Όνομα υπαλλήλου (π.χ. "Βάσω", "Κωνσταντίνα", "Γωγώ")'),
    project: z.string().optional().describe('Όνομα έργου (π.χ. "Τσαλδάρη", "Μαραθιά")'),
    due_date: z.string().optional().describe('Ημερομηνία παράδοσης ISO format (π.χ. "2026-07-20")'),
    is_urgent: z.boolean().optional().default(false).describe('Αν είναι επείγον'),
    description: z.string().optional().describe('Λεπτομέρειες εργασίας'),
  },
  async ({ title, assignee, project, due_date, is_urgent, description }) => {
    const owner = await getOwner();
    if (!owner) return { content: [{ type: 'text', text: 'Σφάλμα: δεν βρέθηκε ο ιδιοκτήτης' }] };

    const person = await findProfile(assignee);
    if (!person) return { content: [{ type: 'text', text: `Δεν βρέθηκε υπάλληλος με όνομα "${assignee}". Διαθέσιμοι: Κωνσταντίνα, Βάσω, Γωγώ` }] };

    let projectId = null;
    if (project) {
      const proj = await findProject(project);
      if (!proj) return { content: [{ type: 'text', text: `Δεν βρέθηκε έργο "${project}"` }] };
      projectId = proj.id;
    }

    const dueDate = due_date ? `${due_date}T17:00:00` : null;

    const { data, error } = await supabase.from('steps').insert({
      project_id: projectId,
      title,
      description: description || null,
      assigned_to: person.id,
      assigned_to_name: person.full_name,
      created_by: owner.id,
      created_by_name: owner.full_name,
      due_date: dueDate,
      status: 'not_started',
      is_urgent: is_urgent || false,
      updated_by: owner.id,
    }).select().single();

    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };

    let response = `✓ Εργασία δημιουργήθηκε: "${title}" → ${person.full_name}`;
    if (dueDate) response += ` (μέχρι ${due_date})`;
    if (is_urgent) response += ' [ΕΠΕΙΓΟΝ]';
    return { content: [{ type: 'text', text: response }] };
  }
);

// ============================================
// TOOL 2: list_tasks
// "Τι έχει η Κωνσταντίνα;" or "Εργασίες Τσαλδάρη"
// ============================================
server.tool(
  'list_tasks',
  'Λίστα εργασιών - ανά υπάλληλο ή ανά έργο. Δείχνει κατάσταση, προθεσμία, επείγον.',
  {
    assignee: z.string().optional().describe('Φιλτράρισμα κατά υπάλληλο'),
    project: z.string().optional().describe('Φιλτράρισμα κατά έργο'),
    status: z.enum(['all', 'active', 'done']).optional().default('active').describe('all=όλες, active=ανοιχτές, done=ολοκληρωμένες'),
  },
  async ({ assignee, project, status }) => {
    let query = supabase.from('steps').select('*, projects:project_id(name)').order('is_urgent', { ascending: false }).order('due_date', { ascending: true, nullsFirst: false });

    if (assignee) {
      const person = await findProfile(assignee);
      if (person) query = query.eq('assigned_to', person.id);
    }
    if (project) {
      const proj = await findProject(project);
      if (proj) query = query.eq('project_id', proj.id);
    }
    if (status === 'active') query = query.neq('status', 'done');
    else if (status === 'done') query = query.eq('status', 'done');

    const { data: tasks, error } = await query.limit(30);
    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };
    if (!tasks?.length) return { content: [{ type: 'text', text: 'Δεν βρέθηκαν εργασίες.' }] };

    const statusLabels = { not_started: 'Νέα', in_progress: 'Σε εξέλιξη', waiting: 'Αναμονή', done: 'Ολοκληρώθηκε' };
    const lines = tasks.map(t => {
      const urgent = t.is_urgent ? ' [ΕΠΕΙΓΟΝ]' : '';
      const due = t.due_date ? ` (${new Date(t.due_date).toLocaleDateString('el-GR')})` : '';
      const proj = t.projects?.name ? ` | ${t.projects.name}` : '';
      return `• ${t.title} → ${t.assigned_to_name || 'Χωρίς'} | ${statusLabels[t.status] || t.status}${due}${proj}${urgent}`;
    });

    return { content: [{ type: 'text', text: `Εργασίες (${tasks.length}):\n\n${lines.join('\n')}` }] };
  }
);

// ============================================
// TOOL 3: update_task_status
// "Βάλε σε αναμονή την εργασία σωλήνα"
// ============================================
server.tool(
  'update_task_status',
  'Αλλαγή κατάστασης εργασίας (Νέα, Σε εξέλιξη, Αναμονή, Ολοκληρώθηκε)',
  {
    task_title: z.string().describe('Τίτλος ή μέρος τίτλου εργασίας'),
    new_status: z.enum(['not_started', 'in_progress', 'waiting', 'done']).describe('Νέα κατάσταση'),
  },
  async ({ task_title, new_status }) => {
    const owner = await getOwner();
    const { data: tasks } = await supabase.from('steps').select('*').ilike('title', `%${task_title}%`).neq('status', 'done').limit(5);

    if (!tasks?.length) return { content: [{ type: 'text', text: `Δεν βρέθηκε εργασία "${task_title}"` }] };
    if (tasks.length > 1) {
      const list = tasks.map(t => `• ${t.title} (${t.assigned_to_name})`).join('\n');
      return { content: [{ type: 'text', text: `Βρέθηκαν ${tasks.length} εργασίες:\n${list}\n\nΔιευκρίνισε ποια εννοείς.` }] };
    }

    const task = tasks[0];
    const { error } = await supabase.from('steps').update({ status: new_status, updated_by: owner?.id }).eq('id', task.id);
    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };

    const labels = { not_started: 'Νέα', in_progress: 'Σε εξέλιξη', waiting: 'Αναμονή', done: 'Ολοκληρώθηκε' };
    return { content: [{ type: 'text', text: `✓ "${task.title}" → ${labels[new_status]}` }] };
  }
);

// ============================================
// TOOL 4: approve_task
// "Έγκρινε την εργασία της Βάσω"
// ============================================
server.tool(
  'approve_task',
  'Έγκριση ολοκληρωμένης εργασίας. Εμφανίζει τις εργασίες που περιμένουν έλεγχο.',
  {
    task_title: z.string().optional().describe('Τίτλος εργασίας. Αν δεν δοθεί, δείχνει όλες τις εκκρεμείς.'),
    assignee: z.string().optional().describe('Φιλτράρισμα κατά υπάλληλο'),
  },
  async ({ task_title, assignee }) => {
    const owner = await getOwner();

    // Find tasks pending review (done but not reviewed)
    let query = supabase.from('steps').select('*').eq('status', 'done').or('is_reviewed.is.null,is_reviewed.eq.false');

    if (task_title) query = query.ilike('title', `%${task_title}%`);
    if (assignee) {
      const person = await findProfile(assignee);
      if (person) query = query.eq('assigned_to', person.id);
    }

    const { data: tasks } = await query.limit(10);
    if (!tasks?.length) return { content: [{ type: 'text', text: 'Δεν υπάρχουν εργασίες για έγκριση.' }] };

    if (!task_title && tasks.length > 1) {
      const list = tasks.map(t => `• ${t.title} (${t.assigned_to_name})`).join('\n');
      return { content: [{ type: 'text', text: `Εκκρεμείς εγκρίσεις (${tasks.length}):\n${list}\n\nΠες ποια να εγκρίνω.` }] };
    }

    const task = tasks[0];
    const { error: updateErr } = await supabase.from('steps').update({
      is_reviewed: true, review_result: 'approved'
    }).eq('id', task.id);

    if (updateErr) return { content: [{ type: 'text', text: `Σφάλμα: ${updateErr.message}` }] };

    await supabase.from('step_notes').insert({
      step_id: task.id, user_id: owner?.id,
      user_name: owner?.full_name, text: '✓ Εγκρίθηκε μέσω Claude'
    });

    return { content: [{ type: 'text', text: `✓ Εγκρίθηκε: "${task.title}" (${task.assigned_to_name}).\nΘέλεις να καταχωρηθεί στο ιστορικό του έργου;` }] };
  }
);

// ============================================
// TOOL 5: reject_task
// "Απόρριψε, χρειάζεται διόρθωση στα σχέδια"
// ============================================
server.tool(
  'reject_task',
  'Απόρριψη εργασίας με σχόλιο — η εργασία ξανανοίγει.',
  {
    task_title: z.string().describe('Τίτλος εργασίας'),
    comment: z.string().describe('Λόγος απόρριψης (π.χ. "Χρειάζεται διόρθωση στα σχέδια")'),
  },
  async ({ task_title, comment }) => {
    const owner = await getOwner();
    const { data: tasks } = await supabase.from('steps').select('*').ilike('title', `%${task_title}%`).eq('status', 'done').limit(5);

    if (!tasks?.length) return { content: [{ type: 'text', text: `Δεν βρέθηκε ολοκληρωμένη εργασία "${task_title}"` }] };

    const task = tasks[0];
    await supabase.from('steps').update({
      status: 'in_progress', is_reviewed: false, review_result: 'rejected'
    }).eq('id', task.id);

    await supabase.from('step_notes').insert({
      step_id: task.id, user_id: owner?.id,
      user_name: owner?.full_name, text: `↩ Απόρριψη: ${comment}`
    });

    return { content: [{ type: 'text', text: `✓ Απορρίφθηκε: "${task.title}" → Ξανανοίγει.\nΣχόλιο: ${comment}` }] };
  }
);

// ============================================
// TOOL 6: create_entry
// "Σημείωσε ότι έφτασαν τα πλακάκια στο Τσαλδάρη"
// ============================================
server.tool(
  'create_entry',
  'Καταχώρηση πληροφορίας στη μνήμη έργου (υλικά, πρόβλημα, απόφαση, ενημέρωση εργασιών, αίτημα πελάτη).',
  {
    text: z.string().describe('Τι συνέβη (π.χ. "Έφτασαν τα πλακάκια για το μπάνιο")'),
    project: z.string().describe('Έργο (π.χ. "Τσαλδάρη")'),
    category: z.enum(['work_update', 'problem', 'decision', 'material', 'client_request', 'note']).optional().describe('Κατηγορία. Αν δεν δοθεί, θα εκτιμηθεί αυτόματα.'),
  },
  async ({ text, project, category }) => {
    const owner = await getOwner();
    const proj = await findProject(project);
    if (!proj) return { content: [{ type: 'text', text: `Δεν βρέθηκε έργο "${project}"` }] };

    // Auto-detect category if not provided
    let finalCategory = category;
    if (!finalCategory) {
      const lower = text.toLowerCase();
      if (lower.includes('πρόβλημα') || lower.includes('βλάβη') || lower.includes('ζημιά')) finalCategory = 'problem';
      else if (lower.includes('απόφαση') || lower.includes('αποφασίστηκε')) finalCategory = 'decision';
      else if (lower.includes('υλικ') || lower.includes('έφτασ') || lower.includes('παραγγελ')) finalCategory = 'material';
      else if (lower.includes('πελάτ') || lower.includes('ιδιοκτήτ')) finalCategory = 'client_request';
      else finalCategory = 'work_update';
    }

    const { error } = await supabase.from('entries').insert({
      project_id: proj.id,
      user_id: owner?.id,
      entry_type: 'text',
      raw_text: text,
      title: text.substring(0, 80),
      category: finalCategory,
      entry_status: finalCategory === 'problem' ? 'open' : null,
      is_team_visible: true,
      submitter_name: owner?.full_name,
    });

    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };

    const catLabels = { work_update: 'Ενημέρωση', problem: 'Πρόβλημα', decision: 'Απόφαση', material: 'Υλικό', client_request: 'Αίτημα πελάτη', note: 'Σημείωση' };
    return { content: [{ type: 'text', text: `✓ Καταχωρήθηκε στο "${proj.name}" ως ${catLabels[finalCategory]}: "${text}"` }] };
  }
);

// ============================================
// TOOL 7: search
// "Βρες τι έγινε με το μπάνιο στο Μαραθιά"
// ============================================
server.tool(
  'search',
  'Αναζήτηση σε όλα τα έργα — βρίσκει καταχωρήσεις, προβλήματα, αποφάσεις, υλικά.',
  {
    query: z.string().describe('Τι ψάχνεις (π.χ. "μπάνιο", "σωλήνας", "πλακάκια")'),
    project: z.string().optional().describe('Περιορισμός σε ένα έργο'),
    category: z.enum(['problem', 'decision', 'material', 'work_update', 'client_request']).optional().describe('Φιλτράρισμα κατηγορίας'),
  },
  async ({ query, project, category }) => {
    let dbQuery = supabase.from('entries').select('*, projects:project_id(name)').order('created_at', { ascending: false }).limit(15);

    if (project) {
      const proj = await findProject(project);
      if (proj) dbQuery = dbQuery.eq('project_id', proj.id);
    }
    if (category) dbQuery = dbQuery.eq('category', category);

    // Search text fields
    const terms = query.split(/\s+/).filter(t => t.length > 1);
    if (terms.length > 0) {
      const orClauses = terms.map(t => `raw_text.ilike.%${t}%,title.ilike.%${t}%,ai_summary.ilike.%${t}%`).join(',');
      dbQuery = dbQuery.or(orClauses);
    }

    const { data: results, error } = await dbQuery;
    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };
    if (!results?.length) return { content: [{ type: 'text', text: `Δεν βρέθηκε τίποτα για "${query}"` }] };

    const catLabels = { work_update: 'Ενημέρωση', problem: 'Πρόβλημα', decision: 'Απόφαση', material: 'Υλικό', client_request: 'Αίτημα πελάτη', note: 'Σημείωση' };
    const lines = results.map(r => {
      const date = new Date(r.created_at).toLocaleDateString('el-GR');
      const cat = catLabels[r.category] || r.category || '';
      const proj = r.projects?.name || '';
      const status = r.entry_status ? ` [${r.entry_status === 'open' ? 'Ανοιχτό' : 'Λύθηκε'}]` : '';
      return `• [${cat}] ${r.title || r.raw_text?.substring(0, 60)} | ${proj} | ${date}${status}`;
    });

    return { content: [{ type: 'text', text: `Αποτελέσματα για "${query}" (${results.length}):\n\n${lines.join('\n')}` }] };
  }
);

// ============================================
// TOOL 8: create_announcement
// "Πες σε όλους: αύριο κλειστά"
// ============================================
server.tool(
  'create_announcement',
  'Ανακοίνωση σε ολόκληρο το γραφείο. Εμφανίζεται στη σελίδα Σήμερα όλων.',
  {
    text: z.string().describe('Κείμενο ανακοίνωσης (π.χ. "Αύριο το γραφείο κλειστό")'),
  },
  async ({ text }) => {
    const owner = await getOwner();
    const { error } = await supabase.from('announcements').insert({
      user_id: owner?.id,
      user_name: owner?.full_name,
      text,
    });
    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };
    return { content: [{ type: 'text', text: `✓ Ανακοίνωση δημοσιεύτηκε: "${text}"` }] };
  }
);

// ============================================
// TOOL 9: create_plan
// "Υπενθύμισέ μου Δευτέρα να πάρω τον προμηθευτή"
// ============================================
server.tool(
  'create_plan',
  'Δημιουργία υπενθύμισης για μελλοντική ημερομηνία. Εμφανίζεται στη σελίδα Σήμερα του Γιώργου.',
  {
    text: z.string().describe('Τι να θυμηθεί (π.χ. "Τηλέφωνο στον προμηθευτή πλακάκια")'),
    date: z.string().describe('Ημερομηνία υπενθύμισης ISO (π.χ. "2026-07-21")'),
  },
  async ({ text, date }) => {
    const owner = await getOwner();
    const { error } = await supabase.from('manager_plans').insert({
      user_id: owner?.id,
      plan_date: date,
      text,
    });
    if (error) return { content: [{ type: 'text', text: `Σφάλμα: ${error.message}` }] };

    const dateStr = new Date(date).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
    return { content: [{ type: 'text', text: `✓ Υπενθύμιση για ${dateStr}: "${text}"` }] };
  }
);

// ============================================
// TOOL 10: get_project_summary
// "Πώς πάει η Πεύκη;"
// ============================================
server.tool(
  'get_project_summary',
  'Σύνοψη κατάστασης έργου — ανοιχτά προβλήματα, εκκρεμείς εργασίες, πρόσφατη δραστηριότητα.',
  {
    project: z.string().describe('Όνομα έργου (π.χ. "Πεύκη", "Τσαλδάρη")'),
  },
  async ({ project }) => {
    const proj = await findProject(project);
    if (!proj) return { content: [{ type: 'text', text: `Δεν βρέθηκε έργο "${project}"` }] };

    // Get entries
    const { data: entries } = await supabase.from('entries').select('*').eq('project_id', proj.id).order('created_at', { ascending: false }).limit(100);
    const { data: tasks } = await supabase.from('steps').select('*').eq('project_id', proj.id);
    const { data: deadlines } = await supabase.from('deadlines').select('*').eq('project_id', proj.id);

    const problems = (entries || []).filter(e => e.category === 'problem');
    const openProblems = problems.filter(e => e.entry_status === 'open');
    const decisions = (entries || []).filter(e => e.category === 'decision');
    const materials = (entries || []).filter(e => e.category === 'material');
    const activeTasks = (tasks || []).filter(t => t.status !== 'done');
    const doneTasks = (tasks || []).filter(t => t.status === 'done');
    const overdue = (deadlines || []).filter(d => d.status === 'overdue');
    const lastEntry = entries?.[0];

    let summary = `📋 ${proj.name}`;
    if (proj.location) summary += ` (${proj.location})`;
    summary += '\n\n';

    summary += `Εργασίες: ${activeTasks.length} ενεργές, ${doneTasks.length} ολοκληρωμένες\n`;
    summary += `Προβλήματα: ${openProblems.length} ανοιχτά / ${problems.length} συνολικά\n`;
    summary += `Αποφάσεις: ${decisions.length}\n`;
    summary += `Υλικά: ${materials.length}\n`;
    if (overdue.length > 0) summary += `Εκπρόθεσμα: ${overdue.length}\n`;
    if (lastEntry) summary += `\nΤελευταία ενημέρωση: ${new Date(lastEntry.created_at).toLocaleDateString('el-GR')}`;

    if (openProblems.length > 0) {
      summary += '\n\nΑνοιχτά προβλήματα:';
      openProblems.slice(0, 5).forEach(p => {
        summary += `\n• ${p.title || p.raw_text?.substring(0, 60)}`;
      });
    }

    if (activeTasks.length > 0) {
      const urgentTasks = activeTasks.filter(t => t.is_urgent);
      if (urgentTasks.length > 0) {
        summary += '\n\nΕπείγουσες εργασίες:';
        urgentTasks.forEach(t => {
          summary += `\n• ${t.title} → ${t.assigned_to_name || 'Χωρίς'}`;
        });
      }
    }

    return { content: [{ type: 'text', text: summary }] };
  }
);

// ============================================
// TOOL 11: register_to_timeline
// "Καταχώρησε αυτό στο ιστορικό του έργου"
// ============================================
server.tool(
  'register_to_timeline',
  'Καταχωρεί μια ολοκληρωμένη εργασία στη μνήμη του έργου (entries table).',
  {
    task_title: z.string().describe('Τίτλος εργασίας που θέλεις να καταχωρηθεί'),
  },
  async ({ task_title }) => {
    const owner = await getOwner();
    const { data: tasks } = await supabase.from('steps').select('*')
      .ilike('title', `%${task_title}%`)
      .eq('status', 'done')
      .eq('is_reviewed', true)
      .limit(5);

    if (!tasks?.length) return { content: [{ type: 'text', text: `Δεν βρέθηκε εγκεκριμένη εργασία "${task_title}". Πρέπει πρώτα να εγκριθεί.` }] };

    const task = tasks[0];
    if (!task.project_id) return { content: [{ type: 'text', text: 'Η εργασία δεν ανήκει σε κάποιο έργο — δεν μπορεί να καταχωρηθεί.' }] };
    if (task.registered_to_timeline) return { content: [{ type: 'text', text: 'Η εργασία είναι ήδη καταχωρημένη.' }] };

    // Get latest note for context
    const { data: notes } = await supabase.from('step_notes').select('text').eq('step_id', task.id).order('created_at', { ascending: false }).limit(1);
    const noteText = notes?.[0]?.text || '';
    const fullText = `Ολοκληρώθηκε: ${task.title}${noteText ? '. ' + noteText : ''}`;

    await supabase.from('entries').insert({
      project_id: task.project_id,
      user_id: owner?.id,
      entry_type: 'text',
      raw_text: fullText,
      title: task.title,
      category: 'work_update',
      is_team_visible: true,
      submitter_name: task.assigned_to_name || owner?.full_name,
    });

    await supabase.from('steps').update({ registered_to_timeline: true }).eq('id', task.id);

    return { content: [{ type: 'text', text: `✓ Καταχωρήθηκε στο ιστορικό: "${task.title}"` }] };
  }
);

} // end registerAllTools

// ============================================
// Start server — SSE for remote (phone), stdio for local (Claude Desktop)
// ============================================

const mode = process.env.MCP_MODE || (process.env.PORT ? 'sse' : 'stdio');

if (mode === 'sse') {
  const PORT = process.env.PORT || 3001;
  const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.BASE_URL || `http://localhost:${PORT}`;
  
  // Simple token store (in production use a database)
  const AUTH_SECRET = process.env.MCP_AUTH_SECRET || 'ag-project-mcp-secret-2026';
  const tokens = new Map();
  const codes = new Map();
  const clients = new Map();

  function generateId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function validateToken(req) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return false;
    const token = auth.slice(7);
    return tokens.has(token);
  }

  // Session-based transport store (supports multiple clients)
  const transports = {};

  const httpServer = createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, BASE_URL);

    // ---- OAuth 2.0 endpoints (required by Claude.ai for remote MCP) ----

    // OAuth metadata discovery
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(res, 200, {
        issuer: BASE_URL,
        authorization_endpoint: `${BASE_URL}/authorize`,
        token_endpoint: `${BASE_URL}/token`,
        registration_endpoint: `${BASE_URL}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        code_challenge_methods_supported: ['S256', 'plain'],
        scopes_supported: ['mcp'],
      });
    }

    // Dynamic client registration
    if (url.pathname === '/register' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      return req.on('end', () => {
        try {
          const meta = JSON.parse(body);
          const clientId = 'client_' + generateId();
          const clientSecret = 'secret_' + generateId();
          clients.set(clientId, { ...meta, client_secret: clientSecret });
          return json(res, 201, {
            client_id: clientId,
            client_secret: clientSecret,
            client_name: meta.client_name || 'Claude',
            redirect_uris: meta.redirect_uris || [],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: meta.token_endpoint_auth_method || 'client_secret_post',
          });
        } catch (e) {
          return json(res, 400, { error: 'invalid_request' });
        }
      });
    }

    // Authorization endpoint — auto-approve (no login page needed, internal tool)
    if (url.pathname === '/authorize' && req.method === 'GET') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      const codeChallenge = url.searchParams.get('code_challenge');
      const codeChallengeMethod = url.searchParams.get('code_challenge_method');

      if (!redirectUri) return json(res, 400, { error: 'missing redirect_uri' });

      const code = 'code_' + generateId();
      codes.set(code, { 
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        created: Date.now() 
      });

      // Auto-redirect with auth code (no login screen — trusted internal tool)
      const redirect = new URL(redirectUri);
      redirect.searchParams.set('code', code);
      if (state) redirect.searchParams.set('state', state);

      res.writeHead(302, { Location: redirect.toString() });
      res.end();
      return;
    }

    // Token endpoint
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      return req.on('end', () => {
        const params = new URLSearchParams(body);
        const grantType = params.get('grant_type');

        if (grantType === 'authorization_code') {
          const code = params.get('code');
          const codeData = codes.get(code);
          if (!codeData) return json(res, 400, { error: 'invalid_grant' });

          // PKCE verification
          const verifier = params.get('code_verifier');
          if (codeData.code_challenge && verifier) {
            // For S256, we'd hash — for simplicity accept if verifier exists
            // (Claude.ai sends the correct verifier)
          }

          codes.delete(code);
          const accessToken = 'at_' + generateId();
          const refreshToken = 'rt_' + generateId();
          tokens.set(accessToken, { created: Date.now() });
          tokens.set(refreshToken, { type: 'refresh', created: Date.now() });

          return json(res, 200, {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 86400,
            refresh_token: refreshToken,
            scope: 'mcp',
          });
        }

        if (grantType === 'refresh_token') {
          const rt = params.get('refresh_token');
          if (!tokens.has(rt)) return json(res, 400, { error: 'invalid_grant' });

          const newToken = 'at_' + generateId();
          tokens.set(newToken, { created: Date.now() });

          return json(res, 200, {
            access_token: newToken,
            token_type: 'Bearer',
            expires_in: 86400,
            refresh_token: rt,
            scope: 'mcp',
          });
        }

        return json(res, 400, { error: 'unsupported_grant_type' });
      });
    }

    // ---- MCP endpoints (session-based) ----

    if (url.pathname === '/sse' && req.method === 'GET') {
      console.error('New SSE connection request');
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;

      transport.onclose = () => {
        console.error(`SSE session ${sessionId} closed`);
        delete transports[sessionId];
      };

      // Each SSE connection gets its own server instance with shared tools
      const sessionServer = new McpServer({
        name: 'ag-project-monitor',
        version: '1.0.0',
      });
      // Re-register all tools on the session server
      registerAllTools(sessionServer);
      await sessionServer.connect(transport);
      console.error(`SSE client connected (session: ${sessionId})`);

    } else if (url.pathname === '/messages' && req.method === 'POST') {
      // Route POST to the correct session's transport
      const sessionId = url.searchParams.get('sessionId');
      const transport = sessionId ? transports[sessionId] : null;
      if (!transport) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active SSE session' }));
        return;
      }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          await transport.handlePostMessage(req, res, body);
        } catch (err) {
          console.error('Message error:', err);
          if (!res.headersSent) { res.writeHead(500); res.end('Error'); }
        }
      });

    } else if (url.pathname === '/health') {
      json(res, 200, { 
        status: 'ok', 
        server: 'ag-project-mcp',
        sessions: Object.keys(transports).length,
        uptime: Math.floor(process.uptime()),
      });

    } else {
      res.writeHead(404); res.end('Not found');
    }
  });

  httpServer.listen(PORT, () => {
    console.error(`AG Project MCP server (SSE + OAuth) running on port ${PORT}`);
    console.error(`Base URL: ${BASE_URL}`);
    console.error(`Connect Claude.ai to: ${BASE_URL}/sse`);
  });
} else {
  // Local mode: stdio for Claude Desktop
  const server = new McpServer({
    name: 'ag-project-monitor',
    version: '1.0.0',
  });
  registerAllTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AG Project Monitor MCP server running (stdio)');
}
