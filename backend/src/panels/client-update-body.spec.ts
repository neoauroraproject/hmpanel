import { PanelsService } from './panels.service';

/**
 * normalizeClientUpdateBody is a pure helper on PanelsService; invoke it off
 * the prototype so the spec needs no DI graph.
 */
const normalize = (body: Record<string, any>) =>
  (PanelsService.prototype as any).normalizeClientUpdateBody.call(
    null,
    body,
  ) as Record<string, any>;

describe('normalizeClientUpdateBody', () => {
  it('coerces the numeric ClientRecord id into the uuid string', () => {
    const out = normalize({
      id: 456,
      uuid: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      email: 'alice',
      enable: true,
      allowedIPs: '1.2.3.4',
      createdAt: 1758000000000,
      updatedAt: 1758000000001,
    });

    expect(out.id).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(out.uuid).toBeUndefined();
  });

  it('leaves the numeric id empty when the record has no uuid, letting the panel preserve its stored credentials', () => {
    const out = normalize({
      id: 456,
      uuid: '',
      email: 'trojan-client',
      enable: false,
    });

    expect(out.id).toBe('');
    expect(out.uuid).toBeUndefined();
  });

  it('keeps a string id untouched (legacy panels return the uuid in id)', () => {
    const uuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const out = normalize({ id: uuid, email: 'alice' });

    expect(out.id).toBe(uuid);
  });

  it('strips ClientRecord-only fields that the update schema does not accept', () => {
    const out = normalize({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      email: 'alice',
      createdAt: 1758000000000,
      updatedAt: 1758000000001,
    });

    expect(out.createdAt).toBeUndefined();
    expect(out.updatedAt).toBeUndefined();
  });
});
