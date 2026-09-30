import test from 'node:test';
import assert from 'node:assert/strict';
const mac=await import('../scripts/mac-package.mjs').catch(()=>({}));

test('Mac executable verification rejects wrong CPU and non-Mach-O data',()=>{
  assert.equal(typeof mac.verifyMachO,'function');
  for(const [architecture,cpu] of [['arm64',0x0100000c],['x64',0x01000007]]){
    const bytes=Buffer.alloc(32);
    bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(cpu,4);
    assert.doesNotThrow(()=>mac.verifyMachO(bytes,architecture));
    assert.throws(()=>mac.verifyMachO(bytes,architecture==='arm64'?'x64':'arm64'),/architecture/);
    assert.throws(()=>mac.verifyMachO(bytes,'universal'),/Unsupported/);
  }
  assert.throws(()=>mac.verifyMachO(Buffer.alloc(32),'arm64'),/Mach-O/);
  assert.throws(()=>mac.verifyMachO(Buffer.alloc(2),'arm64'),/header/);
});
