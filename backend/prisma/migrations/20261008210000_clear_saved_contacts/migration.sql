-- A agenda passa a conter apenas contatos escolhidos manualmente daqui em diante.
-- Mantém contatos, conversas e mensagens no banco.
UPDATE `Contact` SET `isSaved` = false WHERE `isSaved` = true;
