export function preparePoll(question: string, options: string[], multiple: boolean) {
  const poll = { question: question.trim(), options: options.map(option => option.trim()), selectableCount: multiple ? options.length : 1 };
  if (!poll.question || poll.question.length > 255) throw new Error('Escreva uma pergunta de até 255 caracteres.');
  if (poll.options.length < 2 || poll.options.length > 12 || poll.options.some(option => !option || option.length > 100)) throw new Error('Preencha de 2 a 12 opções, com até 100 caracteres cada.');
  if (new Set(poll.options.map(option => option.toLocaleLowerCase('pt-BR'))).size !== poll.options.length) throw new Error('As opções da enquete precisam ser diferentes.');
  return poll;
}
