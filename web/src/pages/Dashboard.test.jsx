import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../services/dashboardService", () => ({
  getDashboardStats: vi.fn(async () => ({
    activeClients: 225,
    activeServices: 1,
    pendingTasks: 0,
    totalOutstanding: 20033.01,
    documentsThisMonth: 0,
    appointmentsToday: 0,
  })),
}));

vi.mock("../services/engagementService", () => ({
  getEngagements: vi.fn(async () => []),
}));

vi.mock("../services/invoiceService", () => ({
  getInvoices: vi.fn(async () => []),
}));

vi.mock("../services/appointmentService", () => ({
  getAppointments: vi.fn(async () => []),
}));

vi.mock("../components/common/StatusBadge", () => ({
  default: ({ status }) => <span>{status}</span>,
}));

describe("Dashboard metric cards", () => {
  const destinations = [
    { label: "Active Clients", path: "/clients/contacts" },
    { label: "Active Services", path: "/services" },
    { label: "Pending Tasks", path: "/services" },
    { label: "Outstanding Amount", path: "/invoices" },
    { label: "Documents This Month", path: "/documents" },
    { label: "Appointments Today", path: "/calendar" },
  ];

  it("renders each metric as an interactive button", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Active Clients/i })).toBeInTheDocument();
    });

    destinations.forEach(({ label }) => {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    });
  });

  it.each(destinations)("navigates to $path when '$label' is clicked", async ({ label, path }) => {
    navigateMock.mockClear();
    render(<Dashboard />);

    const metricButton = await screen.findByRole("button", { name: new RegExp(label, "i") });
    fireEvent.click(metricButton);

    expect(navigateMock).toHaveBeenCalledWith(path);
  });
});
