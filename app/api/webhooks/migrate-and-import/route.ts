import { NextResponse } from 'next/server';
import { queryMain, mainDb } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';
    const expectedToken = process.env.ADMIN_PASSWORD || 'chris.2026';

    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Inspect columns of the "Lead" table
    const columnsRes = await queryMain(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);

    // Inspect the total number of leads
    const countRes = await queryMain('SELECT COUNT(*) as count FROM "Lead"');
    const totalLeads = parseInt(countRes.rows[0].count, 10);

    return NextResponse.json({
      success: true,
      message: 'Migration & Import endpoint is active.',
      totalLeads,
      columns: columnsRes.rows
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
    const { action } = body;

    if (action === 'migrate') {
      // 1. Alter Lead Table
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pie" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "monthlyPayment" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditInterest" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredChannel" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "inboxUrl" TEXT`);

      // 2. Insert/Update Users
      const insertUsersQuery = `
        INSERT INTO "User" (id, name, username, role, password, "createdAt", "updatedAt") VALUES
        ('44444444-4444-4444-4444-444444444444', 'Alimin', 'alimin', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('55555555-5555-5555-5555-555555555555', 'Cami Poblete Yout', 'cami.poblete', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('66666666-6666-6666-6666-666666666666', 'Cindy Gutierrez', 'cindy.gutierrez', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('77777777-7777-7777-7777-777777777777', 'S X G', 'sxg', 'ASESOR', 'placeholder_pw', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `;
      await queryMain(insertUsersQuery);

      return NextResponse.json({ success: true, message: 'Database migrations and advisor setup executed successfully.' });
    }

    if (action === 'import') {
      const { leads, fields } = body;
      if (!Array.isArray(leads) || leads.length === 0) {
        return NextResponse.json({ error: 'Invalid or empty leads array' }, { status: 400 });
      }
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: 'Invalid or empty fields array' }, { status: 400 });
      }

      // Filter fields to only include columns that actually exist in the DB
      const existingColsRes = await queryMain(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'Lead'
      `);
      const existingCols = new Set(existingColsRes.rows.map((r: any) => r.column_name));
      const validFields = fields.filter((f: string) => existingCols.has(f));

      // Build batch insert with only valid fields
      const valuePlaceholders: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      for (const lead of leads) {
        const rowPlaceholders: string[] = [];
        validFields.forEach((field: string) => {
          rowPlaceholders.push(`$${paramIdx++}`);
          let val = lead[field];
          if (val === undefined || val === '') val = null;
          if (field === 'visited' || field === 'visitReminderSent1d' || field === 'visitReminderSent1h') {
            val = val || false;
          }
          if (field === 'status' && !val) {
            val = 'Nuevo';
          }
          params.push(val);
        });
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      // Simple INSERT, skip duplicates by primary key (id)
      const query = `
        INSERT INTO "Lead" (${validFields.map((f: string) => `"${f}"`).join(', ')})
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (id) DO NOTHING
      `;

      const result = await queryMain(query, params);
      return NextResponse.json({ success: true, count: leads.length, inserted: result.rowCount });
    }

    if (action === 'clean_tags') {
      const query = `
        UPDATE "Lead"
        SET tags = (
          SELECT string_agg(DISTINCT trim(tag), ', ')
          FROM unnest(string_to_array(tags, ',')) AS tag
        )
        WHERE tags IS NOT NULL AND tags LIKE '%,%';
      `;
      const result = await queryMain(query);
      return NextResponse.json({ success: true, message: `Tags cleaned in ${result.rowCount} rows.` });
    }

    if (action === 'deactivate_barbara') {
      const BARBARA_ID = '77cea468-b4a5-44e6-aaa5-0a3f376affb1';
      const MARCELA_ID = 'db1e6577-01b1-4615-b35e-0d50752452f3';
      const ORLANDO_ID = 'a6ce92ca-f1a1-4dcf-a042-fda1c31ca485';

      const client = await mainDb.connect();
      try {
        await client.query('BEGIN');

        // 1. Get all leads assigned to Barbara
        const leadsRes = await client.query(
          'SELECT id FROM "Lead" WHERE "assignedToId" = $1 ORDER BY "createdAt" ASC',
          [BARBARA_ID]
        );
        const leadIds = leadsRes.rows.map((r: any) => r.id);
        
        let marcelaLeadsCount = 0;
        let orlandoLeadsCount = 0;

        // 2. Reassign leads 50/50 between Marcela and Orlando
        for (let i = 0; i < leadIds.length; i++) {
          const targetId = i % 2 === 0 ? MARCELA_ID : ORLANDO_ID;
          await client.query(
            'UPDATE "Lead" SET "assignedToId" = $1 WHERE id = $2',
            [targetId, leadIds[i]]
          );
          if (targetId === MARCELA_ID) {
            marcelaLeadsCount++;
          } else {
            orlandoLeadsCount++;
          }
        }

        // 3. Reassign Reservations to Orlando
        const reservationsRes = await client.query(
          'UPDATE "Reservation" SET "createdById" = $1 WHERE "createdById" = $2',
          [ORLANDO_ID, BARBARA_ID]
        );
        const reservationsMigrated = reservationsRes.rowCount || 0;

        // 4. Reassign Messages to Orlando
        const messagesRes = await client.query(
          'UPDATE "Message" SET "senderId" = $1 WHERE "senderId" = $2',
          [ORLANDO_ID, BARBARA_ID]
        );
        const messagesMigrated = messagesRes.rowCount || 0;

        // 5. Delete Notifications sent/assigned to Barbara
        const notificationsRes = await client.query(
          'DELETE FROM "Notification" WHERE "userId" = $1',
          [BARBARA_ID]
        );
        const notificationsDeleted = notificationsRes.rowCount || 0;

        // 6. Delete Barbara's User record
        const userRes = await client.query(
          'DELETE FROM "User" WHERE id = $1',
          [BARBARA_ID]
        );
        const userDeleted = userRes.rowCount || 0;

        // 7. Insert notification entries in the DB so they see them in the UI
        try {
          if (marcelaLeadsCount > 0) {
            await client.query(
              'INSERT INTO "Notification" (id, "userId", title, body, type, read, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
              [crypto.randomUUID(), MARCELA_ID, "Nuevos Clientes Asignados 📈", `Se te han asignado ${marcelaLeadsCount} clientes históricos debido a la deactivación de Barbara.`, "ASSIGNMENT", false]
            );
          }
          if (orlandoLeadsCount > 0) {
            await client.query(
              'INSERT INTO "Notification" (id, "userId", title, body, type, read, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
              [crypto.randomUUID(), ORLANDO_ID, "Nuevos Clientes Asignados 📈", `Se te han asignado ${orlandoLeadsCount} clientes históricos debido a la deactivación de Barbara.`, "ASSIGNMENT", false]
            );
          }
        } catch (notifErr: any) {
          console.error(`Failed to insert notifications into DB:`, notifErr.message);
        }

        await client.query('COMMIT');

        return NextResponse.json({
          success: true,
          message: 'Barbara deactivated and data reassigned successfully.',
          leadsReassigned: leadIds.length,
          leadsToMarcela: marcelaLeadsCount,
          leadsToOrlando: orlandoLeadsCount,
          reservationsReassigned: reservationsMigrated,
          messagesReassigned: messagesMigrated,
          notificationsDeleted,
          userDeleted
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
