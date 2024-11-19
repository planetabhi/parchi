#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { program } = require('commander');

// Default config
const CONFIG = {
  logDirName: process.env.PARCHI_LOGDIR_NAME || '.parchi',
  defaultLogDir: process.env.PARCHI_DEFAULT_LOGDIR || path.join(os.homedir(), '.parchi'),
  logFilePattern: process.env.PARCHI_LOGFILE_PATTERN || '%Y-%m-%d.md',
  editCmd: process.env.PARCHI_EDIT_CMD || getDefaultEditor(),
  readCmd: process.env.PARCHI_READ_CMD || getDefaultReader(),
  grepCmd: process.env.PARCHI_GREP_CMD || 'grep -i -R -F --color'
};

function getDefaultEditor() {
  if (process.env.EDITOR) return process.env.EDITOR;
  
  const editors = [
    'code',
    'cursor',
    'subl',
    'atom',
    'nano',
    'vim',
    'vi',
    'gedit',
    'notepad',
    'emacs'
  ];
  for (const editor of editors) {
    try {
      execSync(`which ${editor}`, { stdio: 'ignore' });
      return editor;
    } catch (e) {
      continue;
    }
  }
  return 'nano'; // Fallback
}

function getDefaultReader() {
  const pager = process.env.PAGER || 'less';
  return pager === 'less' ? 'less -I -K -s --tilde' : pager;
}

async function findLogDir(startDir) {
  let currentDir = startDir;
  
  while (currentDir !== path.parse(currentDir).root) {
    const logDirPath = path.join(currentDir, CONFIG.logDirName);
    try {
      const stats = await fs.stat(logDirPath);
      if (stats.isDirectory()) {
        return logDirPath;
      }
    } catch (e) {}
    currentDir = path.dirname(currentDir);
  }
  
  // Fall back to default directory
  return CONFIG.defaultLogDir;
}

function formatDate(pattern, useUtc = false) {
  const date = new Date();
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = String(useUtc ? date.getUTCMonth() + 1 : date.getMonth() + 1).padStart(2, '0');
  const day = String(useUtc ? date.getUTCDate() : date.getDate()).padStart(2, '0');
  const week = String(Math.ceil((date - new Date(year, 0, 1)) / (7 * 24 * 60 * 60 * 1000))).padStart(2, '0');
  
  return pattern
    .replace('%Y', year)
    .replace('%m', month)
    .replace('%d', day)
    .replace('%U', week);
}

async function ensureLogDirExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

// Command implementations
async function editEntry(entry, options) {
  const logDir = options.logDir || await findLogDir(process.cwd());
  await ensureLogDirExists(logDir);
  
  const fileName = entry || formatDate(CONFIG.logFilePattern, options.utc);
  const filePath = path.join(logDir, fileName);
  
  const cmd = CONFIG.editCmd.includes('{}') 
    ? CONFIG.editCmd.replace('{}', filePath)
    : `${CONFIG.editCmd} "${filePath}"`;
    
  execSync(cmd, { stdio: 'inherit' });
}

async function appendEntry(message, options) {
  const logDir = options.logDir || await findLogDir(process.cwd());
  await ensureLogDirExists(logDir);
  
  const fileName = formatDate(CONFIG.logFilePattern, options.utc);
  const filePath = path.join(logDir, fileName);
  
  await fs.appendFile(filePath, message + '\n');
  console.log(`Added message to ${path.basename(filePath)}`);
}

async function listEntries(options) {
  const logDir = options.logDir || await findLogDir(process.cwd());
  const files = await fs.readdir(logDir);
  const fileExt = path.extname(CONFIG.logFilePattern);
  
  for (const file of files) {
    if (path.extname(file) === fileExt) {
      const filePath = path.join(logDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const excerpt = content.split('\n').slice(0, 3).join(' ').slice(0, 60);
      console.log(`${path.basename(file, fileExt)}\t${excerpt}${excerpt.length >= 60 ? '...' : ''}`);
    }
  }
}

async function searchEntries(pattern, options) {
  const logDir = options.logDir || await findLogDir(process.cwd());
  const cmd = CONFIG.grepCmd.includes('{}')
    ? CONFIG.grepCmd.replace('{}', logDir)
    : `cd "${logDir}" && ${CONFIG.grepCmd} "${pattern}" *${path.extname(CONFIG.logFilePattern)}`;
    
  execSync(cmd, { stdio: 'inherit' });
}

// CLI setup
program
  .name('parchi')
  .description('Simple note-taking for lazy humans')
  .version('1.47.1');

program
  .command('edit [entry]')
  .description('Edit today\'s entry or specific entry')
  .option('-C, --log-dir <dir>', 'Use specific log directory')
  .option('--utc', 'Use UTC for dates')
  .action(editEntry);

program
  .command('add <message...>')
  .description('Append message to today\'s entry')
  .option('-C, --log-dir <dir>', 'Use specific log directory')
  .option('--utc', 'Use UTC for dates')
  .action((args, options) => appendEntry(args.join(' '), options));

program
  .command('ls')
  .description('List entries')
  .option('-C, --log-dir <dir>', 'Use specific log directory')
  .action(listEntries);

program
  .command('grep <pattern>')
  .description('Search entries')
  .option('-C, --log-dir <dir>', 'Use specific log directory')
  .action(searchEntries);

program.parse();