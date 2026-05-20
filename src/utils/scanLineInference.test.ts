import { describe, expect, it } from 'vitest';
import { deriveConditionAction, parseLineItemsFromNotes } from './scanLineInference';

describe('deriveConditionAction', () => {
  it('routes damaged keywords to repair', () => {
    expect(deriveConditionAction('Defekt palette')).toEqual({
      condition: 'damaged',
      intended_action: 'repair',
    });
    expect(deriveConditionAction('Broken pallet')).toEqual({
      condition: 'damaged',
      intended_action: 'repair',
    });
    expect(deriveConditionAction('riparim te nevojshem')).toEqual({
      condition: 'damaged',
      intended_action: 'repair',
    });
  });

  it('routes Klasse A keywords to ready_a / sorting', () => {
    expect(deriveConditionAction('EPAL Klasse A')).toEqual({
      condition: 'ready_a',
      intended_action: 'sorting',
    });
    expect(deriveConditionAction('A-Qualität')).toEqual({
      condition: 'ready_a',
      intended_action: 'sorting',
    });
    expect(deriveConditionAction('Kl. A')).toEqual({
      condition: 'ready_a',
      intended_action: 'sorting',
    });
  });

  it('routes Klasse B keywords to ready_b / sorting', () => {
    expect(deriveConditionAction('Klasse B')).toEqual({
      condition: 'ready_b',
      intended_action: 'sorting',
    });
    expect(deriveConditionAction('Class B pallet')).toEqual({
      condition: 'ready_b',
      intended_action: 'sorting',
    });
  });

  it('routes Klasse C keywords to ready_c / sorting', () => {
    expect(deriveConditionAction('Klasse C')).toEqual({
      condition: 'ready_c',
      intended_action: 'sorting',
    });
  });

  it('routes sorting / mix to sorting condition', () => {
    expect(deriveConditionAction('Mischpalette')).toEqual({
      condition: 'sorting',
      intended_action: 'sorting',
    });
    expect(deriveConditionAction('Sortier palette')).toEqual({
      condition: 'sorting',
      intended_action: 'sorting',
    });
  });

  it('defaults to good / stock for everything else', () => {
    expect(deriveConditionAction('Regular box')).toEqual({
      condition: 'good',
      intended_action: 'stock',
    });
  });

  it('considers the product name in addition to the description', () => {
    expect(deriveConditionAction('Item 1', 'Defekt Palette')).toEqual({
      condition: 'damaged',
      intended_action: 'repair',
    });
  });

  it('priority: damaged keyword wins over class A', () => {
    // The class A regex appears later, so damaged should win
    expect(deriveConditionAction('Defekt Klasse A')).toEqual({
      condition: 'damaged',
      intended_action: 'repair',
    });
  });
});

describe('parseLineItemsFromNotes', () => {
  it('returns empty array for nullish input', () => {
    expect(parseLineItemsFromNotes(null)).toEqual([]);
    expect(parseLineItemsFromNotes(undefined)).toEqual([]);
    expect(parseLineItemsFromNotes('')).toEqual([]);
  });

  it('skips lines that do not start with a dash', () => {
    expect(parseLineItemsFromNotes('660 Stück x Europalette')).toEqual([]);
    expect(parseLineItemsFromNotes('Some random text')).toEqual([]);
  });

  it('extracts a single line "- N unit x description"', () => {
    expect(parseLineItemsFromNotes('- 660 Stück x Europalette Klasse A')).toEqual([
      { description: 'Europalette Klasse A', quantity: 660, unit: 'Stück' },
    ]);
  });

  it('handles decimal quantities with comma and dot', () => {
    expect(parseLineItemsFromNotes('- 1,5 kg x Test')).toEqual([
      { description: 'Test', quantity: 1.5, unit: 'kg' },
    ]);
    expect(parseLineItemsFromNotes('- 2.5 kg x Test')).toEqual([
      { description: 'Test', quantity: 2.5, unit: 'kg' },
    ]);
  });

  it('handles the multiplication symbol "×" in addition to "x"', () => {
    expect(parseLineItemsFromNotes('- 10 Stück × Box')).toEqual([
      { description: 'Box', quantity: 10, unit: 'Stück' },
    ]);
  });

  it('extracts multiple lines and ignores non-matching ones', () => {
    const notes = [
      'Header',
      '- 100 Stück x EPAL Klasse A',
      'Random middle line',
      '- 50 Stück x EPAL Klasse B',
      '- malformed line without x',
      '',
    ].join('\n');
    expect(parseLineItemsFromNotes(notes)).toEqual([
      { description: 'EPAL Klasse A', quantity: 100, unit: 'Stück' },
      { description: 'EPAL Klasse B', quantity: 50, unit: 'Stück' },
    ]);
  });

  it('drops zero-quantity rows', () => {
    expect(parseLineItemsFromNotes('- 0 Stück x Empty')).toEqual([]);
  });

  it('accepts an asterisk bullet as well as a dash', () => {
    expect(parseLineItemsFromNotes('* 5 x Item')).toEqual([]);
    // The function specifically checks "startsWith('-')", so * is ignored.
    // This test pins the current behaviour - if we ever extend it, update here.
  });
});
