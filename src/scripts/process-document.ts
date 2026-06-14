import fs from 'fs';
import os from 'os';
import path from 'path';
import mammoth from 'mammoth';
import { execFileSync } from 'child_process';

// Configuration locale
const DB_PATH = path.join(process.cwd(), 'db', 'documents.json');

// Dossier d'archivage des documents classés "mcl".
// Chemin local propre à la machine : à configurer via l'environnement
// (placé dans un .env non versionné). Fallback neutre dans un répertoire
// temporaire pour rester portable et ne jamais coder en dur un chemin perso.
const MCL_ARCHIVE_DIR = process.env.MCL_ARCHIVE_DIR
  ? path.resolve(process.env.MCL_ARCHIVE_DIR)
  : path.join(os.tmpdir(), 'oria-documents', 'mcl');
const VENTURE_HATS = ['suivia', 'hq', 'personal'];
const INTELLIGENCE_KEYWORDS = ['skill', 'intelligence', 'automation', 'automatisation', 'code', 'script', 'api', 'prompt', 'guide', 'tuto'];
const ACTION_KEYWORDS = ['plan', 'prd', 'facture', 'action', 'todo', 'à faire', 'urgent'];

type ProcessedDocument = {
  filename: string;
  hat: string;
  filepath: string;
};

type PdfParseResult = {
  text: string;
};

type PdfParser = (buffer: Buffer) => Promise<PdfParseResult>;

async function parsePdf(buffer: Buffer) {
  const pdfParseModule = (await import('pdf-parse')) as unknown as {
    default?: PdfParser;
    pdf?: PdfParser;
  };
  const parser = pdfParseModule.default ?? pdfParseModule.pdf;

  if (!parser) {
    throw new Error('pdf-parse parser export not found.');
  }

  return parser(buffer);
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const dataBuffer = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const data = await parsePdf(dataBuffer);
    return data.text;
  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    return result.value;
  } else if (['.txt', '.md', '.jsx', '.tsx', '.ts', '.js'].includes(ext)) {
    return dataBuffer.toString();
  }
  return '';
}

function determineCategory(filename: string, text: string): { type: 'mcl' | 'intelligence' | 'venture', subType?: string } {
  const content = (filename + ' ' + text).toLowerCase();
  
  // 1. Priorité MCL (archivé séparément via MCL_ARCHIVE_DIR)
  if (content.includes('mcl')) {
    return { type: 'mcl' };
  }

  // 2. Intelligence / Skills / Code (Centralisé)
  const isCodeFile = ['.js', '.ts', '.jsx', '.tsx', '.py', '.ps1', '.sh', '.sql', '.html', '.css', '.json'].includes(path.extname(filename).toLowerCase());
  if (INTELLIGENCE_KEYWORDS.some(k => content.includes(k)) || isCodeFile) {
    let subType = 'code';
    if (content.includes('skill')) subType = 'skills';
    if (content.includes('automat')) subType = 'automatisations';
    return { type: 'intelligence', subType };
  }

  // 3. Venture HQ (Idées, Projets, Plans)
  let subType = 'hq';
  for (const hat of VENTURE_HATS) {
    if (content.includes(hat)) {
      subType = hat;
      break;
    }
  }
  return { type: 'venture', subType };
}

function shouldCreateTask(filename: string, text: string): boolean {
  const content = (filename + ' ' + text).toLowerCase();
  return ACTION_KEYWORDS.some(keyword => content.includes(keyword));
}

function updateLocalDb(doc: ProcessedDocument) {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let docs = [];
  if (fs.existsSync(DB_PATH)) {
    docs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  }

  docs.unshift({
    id: Math.random().toString(36).substr(2, 9),
    ...doc,
    created_at: new Date().toISOString()
  });

  fs.writeFileSync(DB_PATH, JSON.stringify(docs.slice(0, 100), null, 2));
}

async function processFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return;

    const filename = path.basename(filePath);
    console.log(`Analyse : ${filename}`);

    const text = await extractText(filePath);
    const category = determineCategory(filename, text);
    const actionable = shouldCreateTask(filename, text);

    let destDir: string;

    if (category.type === 'mcl') {
      destDir = MCL_ARCHIVE_DIR;
      if (actionable) destDir = path.join(destDir, 'Factures');
    } else if (category.type === 'intelligence') {
      destDir = path.join(process.cwd(), 'intelligence', category.subType || 'code');
    } else {
      // Venture HQ
      destDir = path.join(process.cwd(), 'docs', category.subType || 'hq');
    }

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, filename);

    // Déplacer le fichier
    fs.renameSync(filePath, destPath);
    console.log(`Rangé dans : ${destPath}`);

    // Update DB
    updateLocalDb({
      filename,
      hat: category.type === 'venture' ? category.subType! : category.type,
      filepath: destPath
    });

    // Task Master
    if (actionable) {
      try {
        const prompt = `[Auto] Action requise : ${filename}`;
        execFileSync('npx', ['task-master', 'add-task', '--prompt', prompt], { stdio: 'inherit' });
      } catch {}
    }

    console.log(`Traitement terminé.`);
  } catch (error) {
    console.error(`Erreur :`, error);
  }
}

const fileToProcess = process.argv[2];
if (fileToProcess) {
  processFile(path.resolve(fileToProcess));
} else {
  console.log('Usage: npx tsx src/scripts/process-document.ts <file_path>');
}
