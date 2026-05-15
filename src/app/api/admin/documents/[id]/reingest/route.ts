import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { getDocument } from '@/lib/repositories/document-repo';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { id } = await context.params;
  const tenantId = user.id;

  const doc = await getDocument(supabase, tenantId, id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await inngest.send({
    name: 'document.ingest',
    data: { tenantId, documentId: id },
  });

  return NextResponse.json({ ok: true });
}
