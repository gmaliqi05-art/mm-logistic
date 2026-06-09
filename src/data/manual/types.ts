// Manual content data model. The platform manual is large enough that
// embedding it inside the i18n bundles would bloat translation files; we
// keep the source-of-truth in Albanian here. Other languages can be added
// later by mirroring this shape.

export type ManualParagraph = {
  kind: 'p';
  text: string;
};

export type ManualList = {
  kind: 'list';
  items: string[];
  ordered?: boolean;
};

export type ManualSteps = {
  kind: 'steps';
  title?: string;
  steps: string[];
};

export type ManualFields = {
  kind: 'fields';
  title?: string;
  fields: { name: string; description: string; required?: boolean }[];
};

export type ManualCallout = {
  kind: 'callout';
  tone: 'info' | 'warn' | 'tip';
  text: string;
};

export type ManualBlock =
  | ManualParagraph
  | ManualList
  | ManualSteps
  | ManualFields
  | ManualCallout;

export type ManualPage = {
  id: string;
  route?: string;
  title: string;
  premium?: boolean;
  blocks: ManualBlock[];
};

export type ManualGroup = {
  id: string;
  title: string;
  intro?: string;
  pages: ManualPage[];
};

export type ManualSection = {
  id: string;
  role: 'company' | 'depot_depoist' | 'depot_reparature' | 'driver' | 'accounting' | 'logistics';
  title: string;
  intro: string;
  groups: ManualGroup[];
};
