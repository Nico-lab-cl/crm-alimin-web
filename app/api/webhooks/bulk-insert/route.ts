import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';
    const expectedToken = process.env.ADMIN_PASSWORD || 'chris.2026';

    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const countRes = await queryMain('SELECT COUNT(*) as count FROM "Lead"');
    const totalLeads = parseInt(countRes.rows[0].count, 10);

    return NextResponse.json({
      success: true,
      message: 'Bulk insert endpoint is active.',
      totalLeads
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const expectedToken = process.env.ADMIN_PASSWORD || 'chris.2026';

    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, leads, fields } = body;

    if (action === 'migrate') {
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pie" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "monthlyPayment" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditInterest" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredChannel" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "inboxUrl" TEXT`);

      const insertUsersQuery = `
        INSERT INTO "User" (id, name, username, role, password, "createdAt", "updatedAt") VALUES
        ('11111111-1111-1111-1111-111111111111', 'Orlando Costa', 'orlando.costa', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('22222222-2222-2222-2222-222222222222', 'Barbara Arias', 'barbara.arias', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('33333333-3333-3333-3333-333333333333', 'Marcela Escobar', 'marcela.escobar', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('44444444-4444-4444-4444-444444444444', 'Alimin', 'alimin', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('55555555-5555-5555-5555-555555555555', 'Cami Poblete Yout', 'cami.poblete', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('66666666-6666-6666-6666-666666666666', 'Cindy Gutierrez', 'cindy.gutierrez', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('77777777-7777-7777-7777-777777777777', 'S X G', 'sxg', 'ASESOR', 'placeholder_pw', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `;
      await queryMain(insertUsersQuery);

      return NextResponse.json({ success: true, message: 'Migrations and advisor setup done.' });
    }

    if (action === 'insert') {
      if (!Array.isArray(leads) || leads.length === 0) {
        return NextResponse.json({ error: 'Empty leads array' }, { status: 400 });
      }
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: 'Empty fields array' }, { status: 400 });
      }

      // Filter to only existing DB columns
      const colRes = await queryMain(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'Lead'
      `);
      const dbCols = new Set(colRes.rows.map((r: any) => r.column_name));
      const validFields = fields.filter((f: string) => dbCols.has(f));

      const valuePlaceholders: string[] = [];
      const params: any[] = [];
      let idx = 1;

      for (const lead of leads) {
        const ph: string[] = [];
        validFields.forEach((field: string) => {
          ph.push(`$${idx++}`);
          let val = lead[field];
          if (val === undefined || val === '') val = null;
          if (field === 'visited' || field === 'visitReminderSent1d' || field === 'visitReminderSent1h') {
            val = val || false;
          }
          if (field === 'status' && !val) val = 'Nuevo';
          params.push(val);
        });
        valuePlaceholders.push(`(${ph.join(', ')})`);
      }

      const query = `
        INSERT INTO "Lead" (${validFields.map((f: string) => `"${f}"`).join(', ')})
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (id) DO NOTHING
      `;

      const result = await queryMain(query, params);
      return NextResponse.json({ success: true, sent: leads.length, inserted: result.rowCount });
    }

    if (action === 'clean_tags') {
      const result = await queryMain(`
        UPDATE "Lead"
        SET tags = (
          SELECT string_agg(DISTINCT trim(tag), ', ')
          FROM unnest(string_to_array(tags, ',')) AS tag
        )
        WHERE tags IS NOT NULL AND tags LIKE '%,%';
      `);
      return NextResponse.json({ success: true, message: `Tags cleaned in ${result.rowCount} rows.` });
    }

    if (action === 'delete_test') {
      const result = await queryMain(`DELETE FROM "Lead" WHERE id = 'test-00000-delete-me'`);
      return NextResponse.json({ success: true, deleted: result.rowCount });
    }

    return NextResponse.json({ error: 'Unknown action. Use: migrate, insert, clean_tags' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
