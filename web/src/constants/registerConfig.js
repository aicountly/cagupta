const STATUS_OPTIONS = [
  { value: '__all__', label: 'All' },
  { value: 'filed',   label: '✅ Filed' },
  { value: 'pending', label: '⏳ Pending' },
  { value: 'late',    label: '🔴 Overdue' },
];

export const REGISTER_CONFIG = {
  gst: {
    label: 'GST Register',
    icon: '📊',
    columns: ['Client', 'GSTIN', 'Return Type', 'Period', 'Due Date', 'Filed Date', 'Status', 'Late Fee'],
    subFilters: [
      {
        key: 'returnType',
        label: 'Return Type',
        type: 'pills',
        options: [
          { value: '__all__', label: 'All' },
          { value: 'GSTR-1',  label: 'GSTR-1' },
          { value: 'GSTR-3B', label: 'GSTR-3B' },
          { value: 'GSTR-9',  label: 'GSTR-9' },
          { value: 'GSTR-9C', label: 'GSTR-9C' },
        ],
      },
      {
        key: 'period',
        label: 'Return Period',
        type: 'dropdown',
        options: 'dynamic',
        dataKey: 'period',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'pills',
        options: STATUS_OPTIONS,
      },
    ],
  },
  tds: {
    label: 'TDS Register',
    icon: '📋',
    columns: ['Client', 'TAN', 'Return Type', 'Quarter', 'FY', 'Due Date', 'Filed Date', 'Status'],
    subFilters: [
      {
        key: 'returnType',
        label: 'Return Type',
        type: 'pills',
        options: [
          { value: '__all__', label: 'All' },
          { value: '24Q',  label: '24Q' },
          { value: '26Q',  label: '26Q' },
          { value: '27Q',  label: '27Q' },
          { value: '27EQ', label: '27EQ' },
        ],
      },
      {
        key: 'quarter',
        label: 'Quarter',
        type: 'pills',
        options: [
          { value: '__all__', label: 'All' },
          { value: 'Q1', label: 'Q1' },
          { value: 'Q2', label: 'Q2' },
          { value: 'Q3', label: 'Q3' },
          { value: 'Q4', label: 'Q4' },
        ],
      },
      {
        key: 'fy',
        label: 'Financial Year',
        type: 'dropdown',
        options: 'dynamic',
        dataKey: 'fy',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'pills',
        options: STATUS_OPTIONS,
      },
    ],
  },
  roc: {
    label: 'ROC Register',
    icon: '🏢',
    columns: ['Client', 'CIN', 'Filing Type', 'FY', 'Due Date', 'Filed Date', 'Status', 'Fee Paid'],
    subFilters: [
      {
        key: 'filingType',
        label: 'Filing Type',
        type: 'pills',
        options: [
          { value: '__all__', label: 'All' },
          { value: 'AOC-4',  label: 'AOC-4' },
          { value: 'MGT-7',  label: 'MGT-7' },
          { value: 'INC-22', label: 'INC-22' },
          { value: 'DIR-3',  label: 'DIR-3' },
        ],
      },
      {
        key: 'fy',
        label: 'Financial Year',
        type: 'dropdown',
        options: 'dynamic',
        dataKey: 'fy',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'pills',
        options: STATUS_OPTIONS,
      },
    ],
  },
  it: {
    label: 'IT Register',
    icon: '💼',
    columns: ['Client', 'PAN', 'Return Type', 'AY', 'Due Date', 'Filed Date', 'Status', 'Refund'],
    subFilters: [
      {
        key: 'returnType',
        label: 'Return Type',
        type: 'pills',
        options: [
          { value: '__all__', label: 'All' },
          { value: 'ITR-1', label: 'ITR-1' },
          { value: 'ITR-2', label: 'ITR-2' },
          { value: 'ITR-3', label: 'ITR-3' },
          { value: 'ITR-4', label: 'ITR-4' },
          { value: 'ITR-5', label: 'ITR-5' },
          { value: 'ITR-6', label: 'ITR-6' },
        ],
      },
      {
        key: 'ay',
        label: 'Assessment Year',
        type: 'dropdown',
        options: 'dynamic',
        dataKey: 'ay',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'pills',
        options: STATUS_OPTIONS,
      },
    ],
  },
  pf: {
    label: 'PF/ESI Register',
    icon: '👥',
    columns: ['Client', 'PF/ESI No.', 'Return Type', 'Month', 'Due Date', 'Filed Date', 'Status'],
    subFilters: [
      {
        key: 'returnType',
        label: 'Return Type',
        type: 'pills',
        options: [
          { value: '__all__', label: 'All' },
          { value: 'PF',  label: 'PF' },
          { value: 'ESI', label: 'ESI' },
        ],
      },
      {
        key: 'period',
        label: 'Month',
        type: 'dropdown',
        options: 'dynamic',
        dataKey: 'period',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'pills',
        options: STATUS_OPTIONS,
      },
    ],
  },
};

// Fallback config for custom/unknown register types
export const DEFAULT_REGISTER_CONFIG = {
  columns: ['Client', 'Period', 'Due Date', 'Filed Date', 'Status'],
  subFilters: [
    {
      key: 'status',
      label: 'Status',
      type: 'pills',
      options: STATUS_OPTIONS,
    },
  ],
};
