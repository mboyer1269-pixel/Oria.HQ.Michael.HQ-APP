import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src')}});
const rule=await jiti.import('@/core/text/display-text-rule.ts');
const {normalizeAgentDisplayName}=await jiti.import('@/features/agents/display-name.ts');
const inRanges=(ranges,cp)=>ranges.some(([a,b])=>cp>=a&&cp<=b);

test('explicit ranges equal [\\p{Cc}\\p{Cf}\\u2028\\u2029] and the trim set over all code points',()=>{
 const trimSet=/^\s$/u;
 for(let cp=0;cp<=0x10ffff;cp++){
  if(cp>=0xd800&&cp<=0xdfff)continue;
  const ch=String.fromCodePoint(cp);
  assert.equal(inRanges(rule.FORBIDDEN_DISPLAY_TEXT_RANGES,cp),rule.FORBIDDEN_DISPLAY_TEXT.test(ch),`forbidden U+${cp.toString(16)}`);
  assert.equal(inRanges(rule.EDGE_WHITESPACE_RANGES,cp),trimSet.test(ch)&&ch.trim()==='',`edge U+${cp.toString(16)}`);
 }
});

test('rejects controls, bidi, zero-width, C1 and line separators; normalizes NFC',()=>{
 for(const bad of ['Ali\u202Ece','Ali\u2066ce','Ali\u200Bce','Ali\u200Dce','Ali\u2028ce','Ali\u2029ce','Ali\u0085ce','Ali\u0001ce','Ali\tce','Ali\u00ADce','Ali\uFEFFce','\u{E0041}x','','   ','x'.repeat(81)])
  assert.equal(normalizeAgentDisplayName(bad),null,JSON.stringify(bad));
 assert.equal(normalizeAgentDisplayName('  Joris  '),'Joris');
 assert.equal(normalizeAgentDisplayName('\u00A0Joris'),'Joris');
 assert.equal(normalizeAgentDisplayName('Cafe\u0301'),'Caf\u00e9');
 assert.equal(normalizeAgentDisplayName('😀'.repeat(80)),'😀'.repeat(80));
 assert.equal(rule.isValidDisplayText('Cafe\u0301',{maxLength:80}),false,'non-NFC rejected by the validator');
 assert.equal(rule.isValidDisplayText('Line 1\nLine\t2',{maxLength:80,multiline:true}),true);
 assert.equal(rule.isValidDisplayText('Line 1\u2028Line 2',{maxLength:80,multiline:true}),false);
});

test('SQL CHECK function is generated from the same ranges',()=>{
 const sql=fs.readFileSync('db/migrations/0034_display_text_rule.sql','utf8');
 assert.ok(sql.includes(`!~ '${rule.toPostgresCharClass(rule.FORBIDDEN_DISPLAY_TEXT_RANGES)}'`));
 const edge=rule.toPostgresCharClass(rule.EDGE_WHITESPACE_RANGES);
 assert.ok(sql.includes(`!~ '^${edge}'`)&&sql.includes(`!~ '${edge}$'`));
 assert.match(sql,/value is nfc normalized/);
 assert.match(sql,/regexp_replace\(value, '\[\\t\\n\\r\]', '', 'g'\)/);
});

test('every display-text consumer uses the shared module, none keeps a private control regex',()=>{
 for(const f of ['src/features/agents/display-name.ts','src/core/employees/field-rules.ts']) assert.match(fs.readFileSync(f,'utf8'),/text\/display-text-rule"/);
 for(const f of ['src/server/employees/store.ts','src/server/employees/service.ts','src/features/employees/create-intention.ts','src/features/employees/components/employee-team.tsx']){
  const s=fs.readFileSync(f,'utf8');assert.match(s,/core\/employees\/field-rules/,f);assert.doesNotMatch(s,/\\u001f/,f);
 }
});
