import Header from '../components/layout/Header';

export default function Stub({ title, subtitle = 'Раздел в разработке.' }) {
  return (
    <>
      <Header title={title} subtitle={subtitle} />
      <div className="p-6 md:p-8 fade-in">
        <div className="card p-8 text-center">
          <div className="text-text-3 text-3xl mb-3">◌</div>
          <h2 className="text-[15px] font-semibold mb-1">Скоро здесь будет контент</h2>
          <p className="text-text-2 text-sm">Этот модуль наполняется на следующих шагах.</p>
        </div>
      </div>
    </>
  );
}
