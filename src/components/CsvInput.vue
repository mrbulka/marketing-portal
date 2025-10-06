<script setup>
import { ref, watch } from 'vue';

const REQUIRED_HEADER = 'userName,userLink,directMessage';
const MAX_TARGETS = 300;

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  label: {
    type: String,
    default: 'Outreach CSV',
  },
  help: {
    type: String,
    default: `Paste CSV with header: ${REQUIRED_HEADER}`,
  },
  requiredHeader: {
    type: String,
    default: REQUIRED_HEADER,
  },
  /**
   * Optional list of allowed headers. If provided, validation will pass when
   * the CSV header matches any of the entries.
   */
  allowedHeaders: {
    type: Array,
    default: () => [REQUIRED_HEADER, 'userName,userLink'],
  },
  maxRows: {
    type: Number,
    default: MAX_TARGETS,
  },
});

const emit = defineEmits(['update:modelValue', 'validity']);

const mode = ref('paste'); // 'paste' | 'file'
const text = ref(props.modelValue || '');
const error = ref('');
const info = ref('');
const rows = ref(0);

watch(
  () => props.modelValue,
  (v) => {
    if (v !== text.value) {
      text.value = v || '';
      validate();
    }
  }
);

watch(text, () => {
  emit('update:modelValue', text.value);
  validate();
});

function onModeChange(e) {
  mode.value = e.target.value;
  // clear state when switching modes
  if (mode.value === 'file') {
    text.value = '';
  }
  error.value = '';
  info.value = '';
  rows.value = 0;
}

function validate() {
  error.value = '';
  info.value = '';
  rows.value = 0;
  const t = (text.value || '').replace(/^\uFEFF/, '');
  if (!t.trim()) {
    emit('validity', { ok: false, reason: 'EMPTY' });
    return;
  }
  const lines = t.split(/\r?\n/);
  const header = (lines[0] || '').trim();
  const allowed = (Array.isArray(props.allowedHeaders) && props.allowedHeaders.length
    ? props.allowedHeaders
    : [props.requiredHeader || REQUIRED_HEADER]);
  if (!allowed.includes(header)) {
    error.value = `Invalid header. Expected one of: ${allowed.join(' | ')}.`;
    emit('validity', { ok: false, reason: 'INVALID_HEADER' });
    return;
  }
  const count = lines.slice(1).filter((l) => l.trim().length > 0).length;
  rows.value = count;
  if (count === 0) {
    error.value = 'No rows found after header.';
    emit('validity', { ok: false, reason: 'EMPTY_ROWS' });
    return;
  }
  if (props.maxRows && count > props.maxRows) {
    error.value = `Too many rows: ${count}. Maximum allowed is ${props.maxRows}.`;
    emit('validity', { ok: false, reason: 'TOO_MANY_ROWS' });
    return;
  }
  info.value = `Validated ${count} rows.`;
  emit('validity', { ok: true, count });
}

async function onFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const content = await file.text();
  text.value = content;
  // validate() will be called via watch
}
</script>

<template>
  <div class="csv-input">
    <label class="label">{{ label }}</label>

    <div class="modes">
      <label><input type="radio" name="csvMode" value="paste" :checked="mode==='paste'" @change="onModeChange"> Paste</label>
      <label><input type="radio" name="csvMode" value="file" :checked="mode==='file'" @change="onModeChange"> Upload File</label>
    </div>

    <p class="help">{{ help }}</p>

    <div v-if="mode==='paste'">
      <textarea
        class="textarea"
        rows="10"
        placeholder="userName,userLink,directMessage&#10;someuser,https://twitter.com/someuser,Hi there!"
        v-model="text"
      ></textarea>
    </div>

    <div v-else>
      <input class="file" type="file" accept=".csv,text/csv" @change="onFileChange" />
      <div v-if="text" class="preview">
        <label>Preview:</label>
        <pre>{{ text.slice(0, 500) }}<span v-if="text.length>500">…</span></pre>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="info" class="info">
      {{ info }} <span v-if="rows">({{ rows }} rows)</span>
    </p>
  </div>
</template>

<style scoped>
.csv-input {
  display: grid;
  gap: 0.5rem;
}
.label {
  font-weight: 600;
}
.modes {
  display: flex;
  gap: 1rem;
}
.help {
  color: #666;
  margin: 0.25rem 0 0.5rem;
}
.textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #ffffff;
  color: #111827;
}
.file {
  display: block;
}
.preview {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.5rem;
  margin-top: 0.5rem;
  max-height: 240px;
  overflow: auto;
}
.error {
  color: #c62828;
  font-weight: 600;
}
.info {
  color: #2e7d32;
  font-weight: 600;
}
</style>
