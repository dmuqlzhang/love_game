import test from 'node:test';
import assert from 'node:assert/strict';
const release=await import('../scripts/release-version.mjs').catch(()=>({}));
test('release tags must match the exact package version before publishing',()=>{
  assert.equal(typeof release.verifyReleaseTag,'function');
  assert.doesNotThrow(()=>release.verifyReleaseTag('refs/heads/main','1.0.0'));
  assert.doesNotThrow(()=>release.verifyReleaseTag('refs/tags/v1.0.0','1.0.0'));
  assert.doesNotThrow(()=>release.verifyReleaseTag('refs/tags/v1.1.0-beta.1','1.1.0-beta.1'));
  assert.throws(()=>release.verifyReleaseTag('refs/tags/v2.0.0','1.0.0'),/version/i);
  assert.throws(()=>release.verifyReleaseTag('refs/tags/vinvalid','1.0.0'),/version/i);
});
