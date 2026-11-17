#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
const {values}=parseArgs({options:{repo:{type:'string',default:process.cwd()},output:{type:'string'},check:{type:'boolean'},help:{type:'boolean',short:'h'}},allowPositionals:false});
if(values.help) {
  console.log('node scripts/codex-docs.mjs --repo /path/to/oss [--output /path/to/artifacts] [--check]\nStarts Codex with PDF Studio MCP configured for this session only. --check validates the CLI configuration without starting an agent.');
} else {
  const repo=path.resolve(values.repo),output=path.resolve(values.output||path.join(repo,'.pdf-studio'));
  const server=fileURLToPath(new URL('../mcp/server.mjs',import.meta.url));
  const args=['-C',repo,'-c',`mcp_servers.pdf_studio.command=${JSON.stringify(process.execPath)}`,'-c',`mcp_servers.pdf_studio.args=${JSON.stringify([server,'--repo',repo,'--output',output])}`,'-c','mcp_servers.pdf_studio.startup_timeout_sec=20','-c','mcp_servers.pdf_studio.tool_timeout_sec=120'];
  if(values.check)args.push('mcp','get','pdf_studio','--json');
  const child=spawn('codex',args,{stdio:'inherit',shell:false});
  child.on('error',error=>{console.error(`Cannot start Codex: ${error.message}`);process.exitCode=1;});
  child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
}
