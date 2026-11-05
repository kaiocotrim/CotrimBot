const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache');
function findCompiler(directory) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.name.toLowerCase() === 'makensis.exe') return target;
    if (entry.isDirectory() && /nsis/i.test(entry.name)) {
      const found = findCompiler(target); if (found) return found;
    }
  }
  return null;
}
const compiler = process.platform === 'win32' ? findCompiler(cache) : null;

test('real NSIS decodes the chosen server from download names, including repeated downloads', { skip: !compiler }, () => {
  const outputRoot = path.resolve(__dirname, '../test-results');
  fs.mkdirSync(outputRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(outputRoot, 'installer-'));
  const binary = path.join(directory, 'base.exe');
  const source = path.join(directory, 'test.nsi');
  fs.writeFileSync(source, `Unicode true
Name "CotrimBot installer test"
OutFile "${binary}"
RequestExecutionLevel user
SilentInstall silent
!include MUI2.nsh
!include "${path.resolve(__dirname, '../installer.nsh')}"
Function .onInit
!insertmacro customInit
FunctionEnd
Section
FileOpen $0 "$EXEDIR\\decoded.txt" w
FileWrite $0 "$CotrimServer"
FileClose $0
SectionEnd
`);
  const build = spawnSync(compiler, ['/V2', source], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  for (const [index, origin] of ['https://chat.cotrimdev.com.br', 'https://cotrim.infordoc.net', 'https://chat.example.com:444'].entries()) {
    const filename = `CotrimBot--${Buffer.from(origin).toString('hex')}${index ? ' (1)' : ''}.exe`;
    const target = path.join(directory, filename);
    fs.copyFileSync(binary, target);
    const execution = spawnSync(target, [], { windowsHide: true, timeout: 10000 });
    assert.equal(execution.status, 0, String(execution.error ?? execution.stderr));
    assert.equal(fs.readFileSync(path.join(directory, 'decoded.txt'), 'utf8'), origin);
  }
});
