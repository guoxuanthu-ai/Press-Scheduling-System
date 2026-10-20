import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, useToast } from './ui';

export function ExcelActions({ entity, canImport, onImported }: { entity: 'tasks' | 'presses' | 'molds' | 'templates'; canImport: boolean; onImported: () => Promise<unknown> | void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/import/${entity}`, { method: 'POST', credentials: 'include', body });
      const result = await response.json().catch(() => ({})) as { message?: string; created?: number; updated?: number };
      if (!response.ok) throw new Error(result.message ?? 'Excel 导入失败');
      await onImported();
      toast(`Excel 导入完成：新增 ${result.created ?? 0} 条，更新 ${result.updated ?? 0} 条`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Excel 导入失败', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Button variant="secondary" size="sm" onClick={() => { window.location.href = `/api/export/${entity}`; }}><Download size={15} />导出 Excel</Button>
    {canImport && <><input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={15} />{uploading ? '导入中…' : '导入 Excel'}</Button></>}
  </div>;
}
