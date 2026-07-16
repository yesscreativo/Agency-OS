"use client";

import { useState } from "react";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  FieldError,
  Input,
  KpiCard,
  Label,
  Modal,
  SegmentedTabs,
  Select,
  Table,
  Td,
  Textarea,
  Th,
  UnderlineTabs,
} from "@agency-os/ui";

function Section({
  index,
  kicker,
  title,
  description,
  children,
}: {
  index: string;
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-12">
      <div className="font-mono text-xs uppercase tracking-widest text-green">
        {index} · {kicker}
      </div>
      <h2 className="mb-1 mt-2 text-3xl font-bold tracking-tight">{title}</h2>
      <p className="mb-7 text-[15px] text-muted">{description}</p>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const [segTab, setSegTab] = useState("todos");
  const [lineTab, setLineTab] = useState("resumen");
  const [chip, setChip] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="pb-20">
      <div className="pt-6">
        <span className="inline-flex items-center gap-2 rounded-pill border bg-green-soft px-3.5 py-1.5 text-xs font-medium text-green [border-color:color-mix(in_srgb,var(--green)_30%,transparent)]">
          <span className="h-[7px] w-[7px] rounded-pill bg-green" />
          Design System · Uso interno · 2026
        </span>
        <h1 className="mt-6 max-w-[16ch] text-5xl font-bold leading-[1.05] tracking-tight">
          Un solo lenguaje visual para <span className="text-green">Agency OS</span>.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-muted">
          Tokens, componentes y plantillas para CRM, operación y dashboards. Verde como acción,
          morado como marca secundaria, sobre lienzo oscuro o claro.
        </p>
      </div>

      <Section
        index="01"
        kicker="Componentes"
        title="Botones"
        description="Verde para la acción primaria. Un solo primario por vista."
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Peligro</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button>
            Con icono <span className="text-base">↗</span>
          </Button>
        </div>
      </Section>

      <Section
        index="02"
        kicker="Componentes"
        title="Badges, chips y estados"
        description="Etiquetas de estado con punto de color. Chips filtrables para segmentar leads."
      >
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <Badge tone="success">Ganado</Badge>
          <Badge tone="info">En proceso</Badge>
          <Badge tone="danger">En riesgo</Badge>
          <Badge tone="neutral">Nuevo</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {[
            ["todos", "Todos · 34"],
            ["alto", "Interés alto"],
            ["medio", "Interés medio"],
            ["bajo", "Interés bajo"],
          ].map(([key = "", label]) => (
            <Chip key={key} active={chip === key} onClick={() => setChip(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        index="03"
        kicker="Componentes"
        title="Avatares"
        description="Iniciales sobre relleno de marca. Grupos con solape y contador."
      >
        <div className="flex flex-wrap items-center gap-7">
          <div className="flex items-end gap-3.5">
            <Avatar initials="JD" tone="purple" size="sm" />
            <Avatar initials="DR" tone="green" size="md" />
            <Avatar initials="WW" tone="purple-strong" size="lg" />
          </div>
          <Avatar initials="JJ" tone="neutral" size="lg" online />
          <AvatarGroup more={6}>
            <Avatar initials="AM" tone="green" />
            <Avatar initials="RT" tone="purple" />
            <Avatar initials="SL" tone="purple-strong" />
          </AvatarGroup>
        </div>
      </Section>

      <Section
        index="04"
        kicker="Componentes"
        title="Inputs y formularios"
        description="Foco con anillo verde. Superficies sutiles, etiquetas claras."
      >
        <div className="grid max-w-[820px] grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="ds-nombre">Nombre del lead</Label>
            <Input id="ds-nombre" defaultValue="Darlene Robertson" />
          </div>
          <div>
            <Label htmlFor="ds-etapa">Etapa</Label>
            <Select id="ds-etapa" defaultValue="Calificación">
              <option>Calificación</option>
              <option>Propuesta</option>
              <option>Negociación</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ds-error">Con error</Label>
            <Input id="ds-error" defaultValue="correo@" invalid />
            <FieldError>Correo no válido</FieldError>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ds-notas">Notas</Label>
            <Textarea
              id="ds-notas"
              rows={3}
              defaultValue="Reunión de seguimiento agendada para el viernes."
            />
          </div>
        </div>
      </Section>

      <Section
        index="05"
        kicker="Componentes"
        title="Tarjetas"
        description="KPI, tarea y lead. La tarjeta de tarea activa se rellena de verde."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Deals activos" value="34" delta="+12%" progress={68} />
          <Card variant="active">
            <div className="flex items-center gap-2 text-xs font-semibold opacity-75">
              <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-green-ink text-[11px] font-bold text-green">
                PT
              </span>
              Peter Thomas
            </div>
            <div className="mt-4 text-[22px] font-bold tracking-tight">Google Meet Call</div>
            <div className="mt-1 text-[13px] font-medium opacity-70">Hoy · 2:00 PM</div>
            <div className="mt-5 flex items-center justify-between">
              <span className="rounded-pill bg-green-ink px-3 py-[5px] text-xs font-semibold text-green">
                Agendada
              </span>
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-pill bg-green-ink text-[15px] text-green">
                →
              </span>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <Avatar initials="JD" tone="purple-strong" size="lg" />
              <div>
                <div className="text-[15px] font-semibold">Jane Doe</div>
                <div className="text-[12.5px] text-muted">Marketing Director · Novatel</div>
              </div>
            </div>
            <div className="mt-4 flex gap-1">
              {[1, 1, 1, 0].map((on, i) => (
                <span
                  key={i}
                  className={`h-[5px] flex-1 rounded-pill ${on ? "bg-green" : "bg-surface-2"}`}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-green">Interés alto</span>
              <span className="font-mono text-xs text-muted">$24,800</span>
            </div>
          </Card>
        </div>
      </Section>

      <Section
        index="06"
        kicker="Componentes"
        title="Navegación"
        description="Tabs segmentadas y tabs con subrayado."
      >
        <div className="flex flex-col items-start gap-5">
          <SegmentedTabs
            activeKey={segTab}
            onSelect={setSegTab}
            items={[
              { key: "todos", label: "Todos" },
              { key: "hoy", label: "Vence hoy" },
              { key: "atrasadas", label: "Atrasadas" },
              { key: "completadas", label: "Completadas" },
            ]}
          />
          <UnderlineTabs
            className="w-full"
            activeKey={lineTab}
            onSelect={setLineTab}
            items={[
              { key: "resumen", label: "Resumen" },
              { key: "actividad", label: "Actividad" },
              { key: "documentos", label: "Documentos" },
            ]}
          />
        </div>
      </Section>

      <Section
        index="07"
        kicker="Componentes"
        title="Tablas y listas"
        description="Filas cómodas con avatar, estado y monto alineado a la derecha."
      >
        <Table>
          <thead>
            <tr>
              <Th>Contacto</Th>
              <Th>Empresa</Th>
              <Th>Estado</Th>
              <Th className="text-right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar initials="DR" tone="purple-strong" />
                  <div>
                    <div className="text-sm font-semibold">Darlene Robertson</div>
                    <div className="text-xs text-muted">Head of Ops</div>
                  </div>
                </div>
              </Td>
              <Td className="text-muted">Cortex Inc.</Td>
              <Td>
                <Badge tone="success">Ganado</Badge>
              </Td>
              <Td className="text-right font-mono text-sm font-bold">$48,200</Td>
            </tr>
            <tr>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar initials="WW" tone="green" />
                  <div>
                    <div className="text-sm font-semibold">Wade Warren</div>
                    <div className="text-xs text-muted">Ops Manager</div>
                  </div>
                </div>
              </Td>
              <Td className="text-muted">Lumen Co.</Td>
              <Td>
                <Badge tone="info">En proceso</Badge>
              </Td>
              <Td className="text-right font-mono text-sm font-bold">$31,000</Td>
            </tr>
            <tr>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar initials="JJ" tone="purple" />
                  <div>
                    <div className="text-sm font-semibold">Jonah Jude</div>
                    <div className="text-xs text-muted">Founder</div>
                  </div>
                </div>
              </Td>
              <Td className="text-muted">Northwind</Td>
              <Td>
                <Badge tone="danger">En riesgo</Badge>
              </Td>
              <Td className="text-right font-mono text-sm font-bold">$12,400</Td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section
        index="08"
        kicker="Componentes"
        title="Overlays"
        description="Dropdowns y modales con sombra de overlay y radios amplios."
      >
        <div className="flex flex-wrap items-start gap-6">
          <Dropdown label="Acciones" trigger={() => <Button variant="outline">Acciones ▾</Button>}>
            <DropdownItem icon={<span className="text-green">✎</span>}>Editar lead</DropdownItem>
            <DropdownItem icon="⧉">Duplicar</DropdownItem>
            <DropdownItem icon="↗">Mover a…</DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger icon="🗑">
              Eliminar
            </DropdownItem>
          </Dropdown>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Abrir modal
          </Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Marcar como ganado"
            description="Se moverá el deal a la etapa final."
            footer={
              <>
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setModalOpen(false)}>Confirmar</Button>
              </>
            }
          />
        </div>
      </Section>
    </div>
  );
}
