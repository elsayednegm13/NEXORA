'use strict';

export const PROJECT_WORKSPACE_MODULES=[
  {id:'overview',icon:'briefcase',labelKey:'projectIdentity'},
  {id:'execution',icon:'list-check',labelKey:'projectExecution'},
  {id:'tickets',icon:'ticket',labelKey:'projectTickets'},
  {id:'files',icon:'folder-open',labelKey:'projectFiles'},
  {id:'clientAccess',icon:'link',labelKey:'clientAccess'},
  {id:'inquiries',icon:'inbox',labelKey:'projectInquiries'},
  {id:'lifecycle',icon:'box-archive',labelKey:'projectLifecycle'}
];

export const STATUS_VISUALS={
  success:{tone:'success',icon:'circle-check'},
  progress:{tone:'progress',icon:'arrows-rotate'},
  waiting:{tone:'warning',icon:'clock'},
  danger:{tone:'danger',icon:'triangle-exclamation'},
  muted:{tone:'muted',icon:'circle-minus'}
};

export const TICKET_STATUS_VISUAL={
  new:{tone:'progress',icon:'sparkles'},
  under_review:{tone:'warning',icon:'magnifying-glass'},
  in_progress:{tone:'progress',icon:'arrows-rotate'},
  waiting_client:{tone:'warning',icon:'user-clock'},
  resolved:{tone:'success',icon:'circle-check'},
  closed:{tone:'success',icon:'lock'},
  rejected:{tone:'danger',icon:'circle-xmark'},
  cancelled:{tone:'muted',icon:'ban'},
  archived:{tone:'muted',icon:'box-archive'}
};

export const TICKET_PRIORITY_VISUAL={
  low:{tone:'muted',icon:'arrow-down'},
  normal:{tone:'muted',icon:'minus'},
  high:{tone:'warning',icon:'arrow-up'},
  urgent:{tone:'danger',icon:'triangle-exclamation'}
};
