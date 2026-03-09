import ClientApp from "./app-client"
import DoctorApp from "./app-doctor"

export default function App() {
  const isDoctor = window.location.pathname === "/doctor"
  return isDoctor ? <DoctorApp /> : <ClientApp />
}
