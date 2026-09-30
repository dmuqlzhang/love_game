import assert from 'node:assert/strict';

export function verifyMachO(bytes,architecture){
  const cpu={arm64:0x0100000c,x64:0x01000007}[architecture];
  assert.ok(cpu,'Unsupported Mac architecture: '+architecture);
  assert.ok(bytes.length>=32,'Truncated Mach-O header');
  assert.equal(bytes.readUInt32LE(0),0xfeedfacf,'Missing 64-bit Mach-O signature');
  assert.equal(bytes.readUInt32LE(4),cpu,'Wrong Mac architecture');
}
