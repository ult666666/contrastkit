// Run from the repository root after `npm run build`: node examples/library.mjs
import {
  auditPalette,
  checkContrast,
  formatHex,
  formatRatio,
  simulateCvd,
  suggestFix,
} from 'contrastkit';

const result = checkContrast('#777777', '#ffffff');
console.log(`#777777 on white: ${formatRatio(result.ratio)}, AA text: ${result.aaText}`);

const fix = suggestFix('#777777', '#ffffff', { level: 'AA' });
if (fix.status === 'fixed') {
  const [best] = fix.candidates;
  console.log(
    `closest AA fix: ${best.hex} (${formatRatio(best.ratio)}, ΔE_OK ${best.deltaE.toFixed(3)})`,
  );
}

console.log(
  `#c53030 with deuteranopia looks like ${formatHex(simulateCvd('#c53030', 'deuteranopia'))}`,
);

const audit = auditPalette({
  text: '#1f2933',
  surface: '#ffffff',
  success: '#2f855a',
  danger: '#c53030',
});
for (const { type, a, b, deltaE } of audit.cvdConfusions) {
  console.log(`hard to tell apart with ${type}: ${a} / ${b} (ΔE_OK ${deltaE.toFixed(3)})`);
}
