import test from "node:test";
import assert from "node:assert/strict";
import { prepareRuntime, compareVersions } from "../scripts/prepare-runtime.mjs";

function fixture({ installed="0.2.0-rc.2", pnpm=true }={}) {
  const calls=[],env={PATH:"/existing-bin"};
  const options={env,nodeVersion:"22.23.3",execPath:"/node",resolveNpm:()=>"npm-cli.mjs",locate:()=>{if(!installed)throw Error("missing");return "/existing-dsh.mjs";},log(){},run(command,args){
    calls.push({command,args});assert.equal(args.includes("view"),false);assert.equal(args.includes("install"),false);
    if(args[0]==="npm-cli.mjs")return {status:0,stdout:"10.9.9"};
    if(args[0]==="/existing-dsh.mjs")return {status:0,stdout:installed};
    if(command.endsWith("pnpm")||command.endsWith("pnpm.cmd"))return pnpm?{status:0,stdout:"12.3.4"}:{status:1};
    assert.fail("Unexpected command");
  }};
  return {calls,env,options};
}
test("compatible DSH versions are reused without network or PATH changes",()=>{
  for(const installed of ["0.2.0-rc.2","0.2.0","0.3.0"]){const f=fixture({installed});assert.equal(prepareRuntime(f.options),"/existing-dsh.mjs");assert.equal(f.env.PATH,"/existing-bin");}
});
test("missing or outdated DSH is upgraded before use; missing pnpm still gives guidance",()=>{
  for (const installed of [null,"0.1.5-rc.1","0.2.0-rc.1"]) {
    const f=fixture({installed});let upgraded=false;
    assert.equal(prepareRuntime({...f.options,upgrade(options){assert.equal(options.version,installed||undefined);upgraded=true;return {cli:"/upgraded.mjs",version:"0.2.0-rc.2"};}}),"/upgraded.mjs");assert.equal(upgraded,true);
  }
  assert.throws(()=>prepareRuntime(fixture({pnpm:false}).options),/不会另装 pnpm 10/);
});
test("unsupported Node stops before npm or filesystem changes",()=>{
  const f=fixture();assert.throws(()=>prepareRuntime({...f.options,nodeVersion:"20.19.0"}),/Node.js 22/);assert.equal(f.calls.length,0);
});
test("release comparison remains available without driving startup updates",()=>{
  assert.equal(compareVersions("0.2.0-rc.2","0.2.0-rc.10"),-1);assert.equal(compareVersions("0.2.0+build.1","0.2.0"),0);
});
