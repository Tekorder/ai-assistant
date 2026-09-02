export interface TaskTableRow {
  id: string;
  text: string;
  checked: boolean;
  deadline?: string;
  listName: string;
}

export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  taskTable?: TaskTableRow[];
}
