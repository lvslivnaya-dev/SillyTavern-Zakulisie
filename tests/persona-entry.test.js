import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedPersonas } from '../src/pud/ui/persona-entry.js';

test('окно выбора персоны: берутся только персоны, подвязанные к этому персонажу или группе', () => {
  const power = {
    personas: { 'a.png': 'Мамия', 'b.png': 'Ая', 'c.png': 'Юзу' },
    persona_descriptions: {
      'a.png': { connections: [{ type: 'character', id: 'ran.png' }] },
      'b.png': { connections: [{ type: 'group', id: 'g1' }] },
      'c.png': { connections: [] },
    },
  };
  assert.deepEqual(connectedPersonas(power, { type: 'character', id: 'ran.png' }).map(item => item.name), ['Мамия']);
  assert.deepEqual(connectedPersonas(power, { type: 'group', id: 'g1' }).map(item => item.name), ['Ая']);
  assert.deepEqual(connectedPersonas(power, { type: 'character', id: 'none.png' }), [], 'никого: показывается предупреждение');
  assert.deepEqual(connectedPersonas(power, null), []);
});
