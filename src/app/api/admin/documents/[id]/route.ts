import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteDocument, getDocument } from '@/lib/repositories/document-repo';

export async function DELETE(
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

  // Best-effort remove of any stored files under this document's prefix.
  // For URL-source docs there's nothing in Storage; for file/text there is.
  const prefix = `${tenantId}/${id}`;
  const { data: objects } = await supabase.storage.from('kb-uploads').list(prefix);
  if (objects && objects.length > 0) {
    const paths = objects.map((o) => `${prefix}/${o.name}`);
    await supabase.storage.from('kb-uploads').remove(paths);
  }

  await deleteDocument(supabase, tenantId, id);
  return NextResponse.json({ ok: true });
}
