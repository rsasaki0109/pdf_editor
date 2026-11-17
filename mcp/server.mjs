#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from './server-factory.js';
try {
  const {values}=parseArgs({options:{repo:{type:'string',default:process.cwd()},output:{type:'string'},help:{type:'boolean',short:'h'}},allowPositionals:false});
  if(values.help){console.log('PDF Studio MCP (stdio)\nnode mcp/server.mjs --repo /path/to/git/repository --output /path/to/artifacts');}
  else {
    const repo=path.resolve(values.repo),output=path.resolve(values.output||path.join(repo,'.pdf-studio'));
    const server=await createMcpServer({repo,output});await server.connect(new StdioServerTransport());
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close().finally(()=>process.exit(0)));
  }
} catch(error){console.error(`PDF Studio MCP: ${error.message}`);process.exitCode=1;}
