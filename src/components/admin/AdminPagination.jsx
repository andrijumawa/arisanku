import { useEffect } from 'react';

export default function AdminPagination({ page, pageSize, total, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page >= pageCount) onPageChange(pageCount - 1);
  }, [onPageChange, page, pageCount]);

  if (!total) return null;

  const firstItem = visiblePage * pageSize + 1;
  const lastItem = Math.min(total, firstItem + pageSize - 1);

  return (
    <nav className="admin-pagination" aria-label="Navigasi halaman daftar">
      <span className="muted small">Menampilkan {firstItem}–{lastItem} dari {total}</span>
      {pageCount > 1 && (
        <div className="admin-pagination-actions">
          <button
            type="button"
            className="btn sm"
            disabled={visiblePage === 0}
            onClick={() => onPageChange(visiblePage - 1)}
          >
            Sebelumnya
          </button>
          <span className="muted small" aria-current="page">Halaman {visiblePage + 1} dari {pageCount}</span>
          <button
            type="button"
            className="btn sm"
            disabled={visiblePage + 1 >= pageCount}
            onClick={() => onPageChange(visiblePage + 1)}
          >
            Berikutnya
          </button>
        </div>
      )}
    </nav>
  );
}
