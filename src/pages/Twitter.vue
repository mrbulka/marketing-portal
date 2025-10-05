<script setup>
import { ref } from 'vue';
import CsvInput from '../components/CsvInput.vue';
import { waitAndDownload } from '../utils/polling';

//
// Outreach DM List (CSV) state
//
const csvText = ref('');
const csvValid = ref(false);
const csvInfo = ref('');
const csvError = ref('');

const dmSubmitting = ref(false);
const dmStatus = ref('');
const dmTurnId = ref('');
const dmAbort = ref(null);

function onCsvValidity(v) {
  if (v?.ok) {
    csvValid.value = true;
    csvError.value = '';
    csvInfo.value = `Validated ${v.count} rows.`;
  } else {
    csvValid.value = false;
    csvInfo.value = '';
    if (v?.reason === 'EMPTY') {
      csvError.value = 'CSV is empty.';
    } else if (v?.reason === 'INVALID_HEADER') {
      csvError.value = 'CSV header invalid.';
    } else if (v?.reason === 'EMPTY_ROWS') {
      csvError.value = 'No rows after header.';
    } else if (v?.reason === 'TOO_MANY_ROWS') {
      csvError.value = 'Too many rows.';
    } else {
      csvError.value = '';
    }
  }
}

async function submitDmList() {
  dmStatus.value = '';
  dmTurnId.value = '';
  if (!csvValid.value || !csvText.value.trim()) {
    csvError.value = 'Please provide a valid CSV.';
    return;
  }
  dmSubmitting.value = true;
  dmAbort.value = new AbortController();

  try {
    const resp = await fetch('/api/marketing/generate_dm_list', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
        Accept: 'application/json',
      },
      body: csvText.value,
      signal: dmAbort.value.signal,
    });

    if (resp.status !== 202) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Unexpected status ${resp.status}`);
    }

    const data = await resp.json();
    dmTurnId.value = data.turnId || '';
    const resultUrl = data.resultUrl;
    dmStatus.value = 'Job accepted. Waiting for results...';

    await waitAndDownload(resultUrl, {
      signal: dmAbort.value.signal,
      onTick: ({ attempt, status, message }) => {
        if (status === 202) {
          dmStatus.value = `Job ${dmTurnId.value || ''} not ready yet (attempt ${attempt + 1}).`;
        } else if (status === 200) {
          dmStatus.value = `Ready. Download should begin in a new tab.`;
        } else if (status === 400) {
          dmStatus.value = 'Invalid token. Please try again.';
        } else if (status === 410) {
          dmStatus.value = 'Result expired. Please start a new job.';
        } else if (status === 0) {
          dmStatus.value = `Network error. Retrying... (attempt ${attempt + 1})`;
        } else {
          dmStatus.value = message || `Status ${status}`;
        }
      },
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      dmStatus.value = 'Cancelled.';
    } else {
      dmStatus.value = e?.message || 'Error submitting job.';
    }
  } finally {
    dmSubmitting.value = false;
  }
}

function cancelDm() {
  dmAbort.value?.abort();
}

//
// Leads generation state
//
const seedUsernamesInput = ref('');
const filtersInput = ref('');
const leadsSubmitting = ref(false);
const leadsStatus = ref('');
const leadsTurnId = ref('');
const leadsAbort = ref(null);
const leadsError = ref('');

function parseSeedUsernames(text) {
  // Split by commas, whitespace, or newlines; trim and filter empties
  return (text || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function submitLeads() {
  leadsStatus.value = '';
  leadsTurnId.value = '';
  leadsError.value = '';

  const seeds = parseSeedUsernames(seedUsernamesInput.value);
  if (!seeds.length) {
    leadsError.value = 'Please provide at least one seed username.';
    return;
  }

  let filters;
  if (filtersInput.value.trim()) {
    try {
      filters = JSON.parse(filtersInput.value);
      if (typeof filters !== 'object' || filters === null) {
        throw new Error('Filters must be a JSON object.');
      }
    } catch (e) {
      leadsError.value = e?.message || 'Invalid filters JSON.';
      return;
    }
  }

  leadsSubmitting.value = true;
  leadsAbort.value = new AbortController();

  try {
    const resp = await fetch('/api/marketing/generate_leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(
        filters !== undefined ? { seedUserNames: seeds, filters } : { seedUserNames: seeds }
      ),
      signal: leadsAbort.value.signal,
    });

    if (resp.status !== 202) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Unexpected status ${resp.status}`);
    }

    const data = await resp.json();
    leadsTurnId.value = data.turnId || '';
    const resultUrl = data.resultUrl;
    leadsStatus.value = 'Job accepted. Waiting for results...';

    await waitAndDownload(resultUrl, {
      signal: leadsAbort.value.signal,
      onTick: ({ attempt, status, message }) => {
        if (status === 202) {
          leadsStatus.value = `Job ${leadsTurnId.value || ''} not ready yet (attempt ${attempt + 1}).`;
        } else if (status === 200) {
          leadsStatus.value = `Ready. Download should begin in a new tab.`;
        } else if (status === 400) {
          leadsStatus.value = 'Invalid token. Please try again.';
        } else if (status === 410) {
          leadsStatus.value = 'Result expired. Please start a new job.';
        } else if (status === 0) {
          leadsStatus.value = `Network error. Retrying... (attempt ${attempt + 1})`;
        } else {
          leadsStatus.value = message || `Status ${status}`;
        }
      },
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      leadsStatus.value = 'Cancelled.';
    } else {
      leadsStatus.value = e?.message || 'Error submitting job.';
    }
  } finally {
    leadsSubmitting.value = false;
  }
}

function cancelLeads() {
  leadsAbort.value?.abort();
}
</script>

<template>
  <main class="container">
    <h1>Twitter Marketing</h1>
    <p class="lead">
      Start a marketing job and download results without exposing backend details. Your CSV results will be proxied and downloaded securely from this site.
    </p>

    <section class="card">
      <h2>Outreach DMs</h2>
      <p>Provide a CSV with the exact header: <code>userName,userLink,directMessage</code>.</p>
      <CsvInput
        v-model="csvText"
        @validity="onCsvValidity"
        label="Outreach CSV"
        :help="'Paste CSV or upload a file (max 300 rows). Header must be: userName,userLink,directMessage'"
      />
      <div class="actions">
        <button class="btn primary" :disabled="dmSubmitting || !csvValid" @click="submitDmList">
          {{ dmSubmitting ? 'Submitting…' : 'Start Outreach Job' }}
        </button>
        <button class="btn" :disabled="!dmSubmitting" @click="cancelDm">Cancel</button>
      </div>
      <p v-if="csvError" class="error">{{ csvError }}</p>
      <p v-if="dmTurnId" class="muted">Turn ID: <code>{{ dmTurnId }}</code></p>
      <p v-if="dmStatus" class="status">{{ dmStatus }}</p>
    </section>

    <section class="card">
      <h2>Leads Discovery</h2>
      <p>Enter seed Twitter usernames (comma, spaces, or newlines separated). Optional: filters JSON.</p>

      <label class="label">Seed Usernames</label>
      <textarea
        class="textarea"
        rows="4"
        placeholder="user1, user2, user3"
        v-model="seedUsernamesInput"
      ></textarea>

      <label class="label">Filters (optional JSON)</label>
      <textarea
        class="textarea"
        rows="4"
        placeholder='{"minFollowers": 100, "keyword": "ai"}'
        v-model="filtersInput"
      ></textarea>

      <div class="actions">
        <button class="btn primary" :disabled="leadsSubmitting" @click="submitLeads">
          {{ leadsSubmitting ? 'Submitting…' : 'Start Leads Job' }}
        </button>
        <button class="btn" :disabled="!leadsSubmitting" @click="cancelLeads">Cancel</button>
      </div>
      <p v-if="leadsError" class="error">{{ leadsError }}</p>
      <p v-if="leadsTurnId" class="muted">Turn ID: <code>{{ leadsTurnId }}</code></p>
      <p v-if="leadsStatus" class="status">{{ leadsStatus }}</p>
    </section>
  </main>
</template>

<style scoped>
.container {
  max-width: 980px;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
}
.lead {
  color: #444;
  margin-bottom: 1.25rem;
}
.card {
  border: 1px solid #e9e9e9;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.25rem;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.label {
  font-weight: 600;
  margin-top: 0.75rem;
  display: block;
}
.textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ddd;
  margin-top: 0.25rem;
}
.actions {
  display: flex;
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.9rem;
  border-radius: 6px;
  background: #f1f1f1;
  color: #222;
  border: 1px solid #e0e0e0;
  cursor: pointer;
}
.btn:hover {
  background: #ececec;
}
.btn.primary {
  background: #42b883;
  color: white;
  border-color: #3aaa79;
}
.btn.primary:hover {
  background: #369f6d;
}
.status {
  font-weight: 600;
  color: #2e7d32;
}
.muted {
  color: #666;
}
.error {
  color: #c62828;
  font-weight: 600;
}
code {
  background: #f6f6f6;
  padding: 0.125rem 0.25rem;
  border-radius: 4px;
}
</style>
