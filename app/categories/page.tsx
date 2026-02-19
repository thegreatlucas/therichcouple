'use client';
// app/categories/page.tsx — Com suporte a subcategorias

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Header from '@/app/components/Header';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  parent_id: string | null;
  created_at: string;
  subcategories?: Category[];
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    icon: '📁',
    color: '#3498db',
    parent_id: '',
  });
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();

  const iconOptions = ['🍔','🚗','🏠','💡','🎮','👕','💊','✈️','🎬','📚','🏋️','🐶','💰','🎁','📱','🛒','☕','🍕','🎵','⚽','🧴','🏥','🎓','💻','🌿'];
  const colorOptions = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#34495e','#e91e63','#00bcd4'];

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const { data: memberData, error } = await supabase
      .from('household_members').select('household_id').eq('user_id', user.id).single();
    if (error || !memberData) { router.push('/setup'); return; }
    setHouseholdId(memberData.household_id);
    loadCategories(memberData.household_id);
  }

  async function loadCategories(hid: string) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', hid)
      .order('name');

    if (error) { setLoading(false); return; }

    // Monta a árvore: separa pais e filhos
    const all = (data || []) as Category[];
    const roots = all.filter(c => !c.parent_id);
    roots.forEach(r => {
      r.subcategories = all.filter(c => c.parent_id === r.id);
    });

    setCategories(roots);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: member } = await supabase
      .from('household_members').select('household_id').eq('user_id', user.id).single();
    if (!member) return;
    const hid = member.household_id;

    const base: any = {
      name: formData.name,
      icon: formData.icon,
      color: formData.color,
      parent_id: formData.parent_id || null,
    };

    if (editingId) {
      const payload = await encryptRecord(base);
      const { error } = await supabase.from('categories').update(payload).eq('id', editingId);
      if (error) { alert('Erro: ' + error.message); return; }
    } else {
      const payload = await encryptRecord({ ...base, household_id: hid });
      const { error } = await supabase.from('categories').insert(payload);
      if (error) { alert('Erro: ' + error.message); return; }
    }

    resetForm();
    loadCategories(hid);
  }

  async function handleDelete(id: string, name: string, hasChildren: boolean) {
    const msg = hasChildren
      ? `Deletar "${name}" e todas as suas subcategorias?`
      : `Deletar "${name}"?`;
    if (!confirm(msg)) return;
    await supabase.from('categories').delete().eq('id', id);
    if (householdId) loadCategories(householdId);
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setFormData({ name: cat.name, icon: cat.icon || '📁', color: cat.color || '#3498db', parent_id: cat.parent_id || '' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setFormData({ name: '', icon: '📁', color: '#3498db', parent_id: '' });
    setShowForm(false);
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Categorias raiz para o select de pai (excluindo a própria ao editar)
  const parentOptions = categories.filter(c => c.id !== editingId);

  if (loading) return <main style={{ padding: 16, color: 'var(--text)' }}>Carregando...</main>;

  return (
    <>
      <Header title="Categorias" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>

        {/* Header da página */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ color: 'var(--text)', margin: 0 }}>Categorias</h1>
            <p style={{ color: 'var(--text3)', fontSize: 13, margin: '4px 0 0' }}>
              {categories.length} categorias · {categories.reduce((n, c) => n + (c.subcategories?.length || 0), 0)} subcategorias
            </p>
          </div>
          <button
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
            style={{ padding: '8px 16px', backgroundColor: showForm ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            {showForm ? '✖️ Cancelar' : '➕ Nova'}
          </button>
        </div>

        {/* Formulário */}
        {showForm && (
          <form onSubmit={handleSubmit} style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: 20, borderRadius: 12, marginBottom: 24 }}>
            <h3 style={{ marginTop: 0, color: 'var(--text)', marginBottom: 16 }}>
              {editingId ? '✏️ Editar categoria' : '➕ Nova categoria'}
            </h3>

            {/* Categoria pai */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                Tipo
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => setFormData(f => ({ ...f, parent_id: '' }))}
                  style={{ padding: '10px 12px', borderRadius: 8, border: !formData.parent_id ? '2px solid #3498db' : '1px solid var(--border)', backgroundColor: !formData.parent_id ? '#e8f4ff' : 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: !formData.parent_id ? 700 : 400, color: 'var(--text)' }}>
                  🏷️ Categoria principal
                </button>
                <button type="button" onClick={() => setFormData(f => ({ ...f, parent_id: parentOptions[0]?.id || '' }))}
                  style={{ padding: '10px 12px', borderRadius: 8, border: formData.parent_id ? '2px solid #9b59b6' : '1px solid var(--border)', backgroundColor: formData.parent_id ? '#f3e8ff' : 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: formData.parent_id ? 700 : 400, color: 'var(--text)' }}>
                  ↳ Subcategoria
                </button>
              </div>
            </div>

            {/* Select de pai — aparece apenas se for subcategoria */}
            {formData.parent_id !== '' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Categoria pai</label>
                <select value={formData.parent_id} onChange={e => setFormData(f => ({ ...f, parent_id: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                  {parentOptions.length === 0
                    ? <option value="">Crie uma categoria principal primeiro</option>
                    : parentOptions.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)
                  }
                </select>
              </div>
            )}

            {/* Nome */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Nome</label>
              <input type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder={formData.parent_id ? 'Ex: Supermercado, iFood...' : 'Ex: Alimentação, Transporte...'}
                required style={{ width: '100%', padding: '9px 12px', fontSize: 15, borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>

            {/* Ícone */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Ícone</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {iconOptions.map(icon => (
                  <button key={icon} type="button" onClick={() => setFormData(f => ({ ...f, icon }))}
                    style={{ fontSize: 22, padding: 7, border: formData.icon === icon ? '2px solid #3498db' : '1px solid var(--border)', borderRadius: 8, backgroundColor: formData.icon === icon ? '#e3f2fd' : 'var(--surface)', cursor: 'pointer' }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Cor */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Cor</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {colorOptions.map(color => (
                  <button key={color} type="button" onClick={() => setFormData(f => ({ ...f, color }))}
                    style={{ width: 36, height: 36, backgroundColor: color, border: formData.color === color ? '3px solid var(--text)' : '2px solid transparent', borderRadius: 8, cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: formData.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                {formData.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
                  {formData.name || 'Nome da categoria'}
                </div>
                {formData.parent_id && (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    ↳ {parentOptions.find(p => p.id === formData.parent_id)?.name || ''}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit"
                style={{ flex: 1, padding: '11px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                {editingId ? '💾 Salvar' : '➕ Criar'}
              </button>
              <button type="button" onClick={resetForm}
                style={{ flex: 1, padding: '11px', backgroundColor: 'var(--border)', color: 'var(--text2)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Lista em árvore */}
        {categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏷️</div>
            <p>Nenhuma categoria ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categories.map(cat => {
              const hasChildren = (cat.subcategories?.length || 0) > 0;
              const isExpanded = expandedIds.has(cat.id);

              return (
                <div key={cat.id}>
                  {/* Categoria principal */}
                  <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: cat.color || '#3498db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                      {cat.icon || '📁'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{cat.name}</div>
                      {hasChildren && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                          {cat.subcategories!.length} subcategoria{cat.subcategories!.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {hasChildren && (
                        <button onClick={() => toggleExpand(cat.id)}
                          style={{ padding: '6px 10px', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: 'var(--text3)' }}>
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                      <button onClick={() => { setFormData(f => ({ ...f, parent_id: cat.id })); setShowForm(true); }}
                        style={{ padding: '6px 10px', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                        title="Adicionar subcategoria">
                        +↳
                      </button>
                      <button onClick={() => startEdit(cat)}
                        style={{ padding: '6px 10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        ✏️
                      </button>
                      <button onClick={() => handleDelete(cat.id, cat.name, hasChildren)}
                        style={{ padding: '6px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Subcategorias */}
                  {hasChildren && isExpanded && (
                    <div style={{ marginLeft: 24, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {cat.subcategories!.map(sub => (
                        <div key={sub.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: `3px solid ${cat.color || '#3498db'}` }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: -4 }}>↳</div>
                          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: sub.color || cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, opacity: 0.9 }}>
                            {sub.icon || cat.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{sub.name}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => startEdit(sub)}
                              style={{ padding: '4px 8px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                              ✏️
                            </button>
                            <button onClick={() => handleDelete(sub.id, sub.name, false)}
                              style={{ padding: '4px 8px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}