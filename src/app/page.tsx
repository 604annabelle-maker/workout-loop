import EquipmentForm from "./equipment-form";

// Reads the database on every request. There is one user and no cache to win.
export const dynamic = "force-dynamic";

const page: React.CSSProperties = {
  maxWidth: "42rem",
  margin: "0 auto",
  padding: "2.5rem 1.5rem 4rem",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  color: "#1c1917",
  lineHeight: 1.6,
};

/**
 * The one page: her gym's equipment. Everything else about her training was
 * agreed in the design and lives in code (src/training/rules.ts); what she
 * says about exercises comes in through the email.
 */
export default function GymPage() {
  return (
    <main style={page}>
      <EquipmentForm />
    </main>
  );
}
