// Aurora background — pure CSS animated blobs, GPU-accelerated
// Used as app-level background beneath all glass panels
export default function AuroraBg() {
  return (
    <div className="aurora-root" aria-hidden="true">
      <div className="aurora-blob a1" />
      <div className="aurora-blob a2" />
      <div className="aurora-blob a3" />
      <div className="aurora-blob a4" />
      <div className="aurora-blob a5" />
      {/* fine noise grain overlay */}
      <div className="aurora-grain" />
    </div>
  );
}
