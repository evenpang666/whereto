import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserLaunchPath, registerBrowserLaunch, studioLaunchUrl } from '../scripts/browser-launch.mjs';
test('map browser handoff uses authenticated mounted URL only for its current DSH instance',()=>{
  const root=mkdtempSync(join(tmpdir(),'whereto-browser-'));
  try {
    const dispose=registerBrowserLaunch(root,{port:3199,instanceId:'current',connection:{authenticatedUrl:url=>url+'?token=private-test-token'}});
    const file=browserLaunchPath(root,3199);
    if(process.platform!=='win32') assert.equal(statSync(file).mode&0o777,0o600);
    assert.equal(studioLaunchUrl(root,'http://localhost:3199','current'),'http://localhost:3199/whereto/?token=private-test-token');
    assert.equal(studioLaunchUrl(root,'http://localhost:3199','stale'),'http://localhost:3199/whereto/');
    dispose();assert.throws(()=>readFileSync(file));
  } finally {rmSync(root,{recursive:true,force:true});}
});
