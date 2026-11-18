import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DOCUMENT_TYPES} from '../src/oss-documents.js';
import {emptyDrafts,readDocumentDraft} from '../src/document-draft.js';
import {createDocumentPdf} from '../src/document-pdf.js';
import {sha256} from './repository.js';
import {readFigures} from '../src/document-figures.js';
export async function openWorkspace(directory,repository) {
  await fs.mkdir(directory,{recursive:true});if((await fs.lstat(directory)).isSymbolicLink())throw new Error('Output directory must not be a symlink.');
  const root=await fs.realpath(directory),queues=new Map();
  const jobs=path.join(root,'jobs');await fs.mkdir(jobs,{recursive:true});if((await fs.lstat(jobs)).isSymbolicLink())throw new Error('Jobs directory must not be a symlink.');
  async function location(id) {
    if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid job ID.');
    const dir=path.join(jobs,id);if((await fs.lstat(dir)).isSymbolicLink()||(await fs.realpath(dir))!==dir)throw new Error('Invalid job directory.');return dir;
  }
  async function write(dir,name,value) {
    const tmp=path.join(dir,`.tmp-${randomUUID()}`);
    try{await fs.writeFile(tmp,value,{flag:'wx',mode:0o600});await fs.rename(tmp,path.join(dir,name));}finally{await fs.rm(tmp,{force:true});}
  }
  async function readJob(id) {
    const dir=await location(id),file=path.join(dir,'job.json');if((await fs.lstat(file)).isSymbolicLink())throw new Error('Invalid job file.');
    const job=JSON.parse(await fs.readFile(file,'utf8'));if(job.repository_root!==repository.root)throw new Error('This job belongs to another repository.');return {dir,job};
  }
  async function withJob(id,fn) {
    const previous=queues.get(id)||Promise.resolve();
    const result=previous.catch(()=>{}).then(async()=>{const {dir,job}=await readJob(id);return fn(dir,job);});queues.set(id,result);
    try{return await result;}finally{if(queues.get(id)===result)queues.delete(id);}
  }
  async function freshness(job,ids) {
    for(const id of ids){const evidence=job.evidence[id];if(!evidence)throw new Error(`Unknown evidence ID: ${id}`);if(await repository.currentHash(evidence.path)!==evidence.file_sha256)throw new Error(`Evidence is stale: ${evidence.path}. Read the file again and revise citations.`);}
  }
  function coverage(job) {
    const kinds=new Set(Object.values(job.evidence).map(item=>item.kind));
    return {evidence_count:Object.keys(job.evidence).length,kinds:[...kinds],verification:'not_run',gaps:['implementation','test','configuration'].filter(kind=>!kinds.has(kind)),notice:'Evidence is static source inspection. Runtime correctness and performance remain unverified unless separately executed and reviewed in Codex.'};
  }
  return {root,
    async create(type,goal) {
      if(!Object.hasOwn(DOCUMENT_TYPES,type))throw new Error('Unknown document type.');
      const id=randomUUID(),dir=path.join(jobs,id);await fs.mkdir(dir,{mode:0o700});
      const job={format:'pdf-studio-agent-job',schema:1,id,type,goal,repository_root:repository.root,repository:await repository.metadata(),evidence:{},status:'researching',created_at:new Date().toISOString()};
      await write(dir,'job.json',JSON.stringify(job,null,2));
      return {job_id:id,type,goal,sections:DOCUMENT_TYPES[type].sections,repository:job.repository,next_steps:['inspect_repository','read_repository_file with this job_id for docs, source, configuration and tests','save_document_draft with citations for every nonempty section','render_document'],verification:'not_run'};
    },
    async addEvidence(id,evidence) {return withJob(id,async(dir,job)=>{
      if(Object.keys(job.evidence).length>=100)throw new Error('This job already has 100 evidence excerpts. Create another job.');
      const evidenceId='src_'+sha256(JSON.stringify(evidence)).slice(0,24);job.evidence[evidenceId]=evidence;
      await write(dir,'job.json',JSON.stringify(job,null,2));return {evidence_id:evidenceId,...evidence};
    });},
    async status(id){return withJob(id,async(_dir,job)=>({job_id:job.id,type:job.type,status:job.status,repository:job.repository,coverage:coverage(job),evidence:Object.entries(job.evidence).map(([id,{excerpt,...item}])=>({evidence_id:id,...item})),artifacts:job.artifacts||{},draft:job.draft||null}));},
    async save(id,draft,citations) {return withJob(id,async(dir,job)=>{
      const config=DOCUMENT_TYPES[job.type],keys=config.sections.map(([key])=>key),sectionValues=draft.sections||{};
      if(Object.keys(sectionValues).some(key=>!keys.includes(key)))throw new Error('Unknown section for this document type.');
      const figures=readFigures(draft.figures);
      const allDrafts=emptyDrafts();allDrafts[job.type]={title:draft.title,author:draft.author||'',abstract:draft.abstract||'',references:'',figures,sections:Object.fromEntries(keys.map(key=>[key,sectionValues[key]||'']))};
      readDocumentDraft(JSON.stringify({format:'oss-document-draft',schema:1,type:job.type,drafts:allDrafts}));
      if(!draft.title?.trim())throw new Error('Title is required.');
      const associations={abstract:citations.abstract||[],...Object.fromEntries(keys.map(key=>[key,citations.sections?.[key]||[]])),...Object.fromEntries(figures.map((_,i)=>[`figure:${i}`,citations.figures?.[i]||[]]))};
      const fields={abstract:draft.abstract||'',...sectionValues,...Object.fromEntries(figures.map((figure,i)=>[`figure:${i}`,figure.source]))};
      for(const [key,text] of Object.entries(fields))if(text.trim()&&!associations[key].length)throw new Error(`Citations are required for ${key}. Leave unsupported sections empty.`);
      const ids=[...new Set(Object.entries(fields).filter(([,text])=>text.trim()).flatMap(([key])=>associations[key]))];if(!ids.length)throw new Error('Source evidence is required.');
      await freshness(job,ids);
      if(!ids.some(evidenceId=>job.evidence[evidenceId].kind!=='documentation'))throw new Error('README/documentation-only drafts are insufficient. Inspect implementation, tests, or configuration and cite the relevant evidence.');
      const references=ids.map((evidenceId,index)=>{
        const e=job.evidence[evidenceId];return `[${index+1}] ${e.path}:${e.start_line}-${e.end_line}\nGit base: ${e.git_commit}${e.working_tree_changed?' (working tree differs)':''}\nSHA-256: ${e.file_sha256}`;
      });
      const cite=(key,text)=>text.trim()?`${text.trim()}\n[${associations[key].map(eid=>ids.indexOf(eid)+1).join(', ')}]`:'';
      const cited={...allDrafts[job.type],figures:figures.map((figure,i)=>({...figure,source:cite(`figure:${i}`,figure.source)})),abstract:cite('abstract',draft.abstract||''),sections:Object.fromEntries(keys.map(key=>[key,cite(key,sectionValues[key]||'')])),references:[job.repository.remote?`Repository: ${job.repository.remote}`:'',...references].filter(Boolean).join('\n\n')};
      const bundle=emptyDrafts();bundle[job.type]=cited;
      if(cited.references.length>6000)throw new Error('References exceed the Web draft limit. Cite fewer, focused source ranges.');
      const payload={format:'oss-document-draft',schema:1,type:job.type,drafts:bundle};
      readDocumentDraft(JSON.stringify(payload));
      job.draft=cited;job.citations=associations;job.used_evidence=ids;job.status='drafted';delete job.artifacts;
      await write(dir,'draft.ossdoc.json',JSON.stringify(payload,null,2));await write(dir,'job.json',JSON.stringify(job,null,2));await fs.rm(path.join(dir,'document.pdf'),{force:true});
      return {job_id:id,status:job.status,draft_path:path.join(dir,'draft.ossdoc.json'),coverage:coverage(job),next_step:'Review prose and citations, then render_document. The JSON opens in the Web document builder.'};
    });},
    async render(id) {return withJob(id,async(dir,job)=>{
      if(!job.draft)throw new Error('Save a cited draft first.');await freshness(job,job.used_evidence);
      const font=await fs.readFile(new URL('../public/fonts/NotoSansJP-Regular.ttf',import.meta.url));
      const bytes=await createDocumentPdf(job.type,job.draft,font);await freshness(job,job.used_evidence);await write(dir,'document.pdf',bytes);
      job.status='rendered';job.artifacts={pdf_path:path.join(dir,'document.pdf'),draft_path:path.join(dir,'draft.ossdoc.json'),pdf_sha256:sha256(bytes)};
      await write(dir,'job.json',JSON.stringify(job,null,2));return {job_id:id,status:job.status,...job.artifacts,coverage:coverage(job)};
    });},
  };
}
