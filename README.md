# CRM de Análise do Comercial · ACR Advogados e Associados

Site estático (HTML, CSS e JavaScript puro) que lê os dados do Supabase.

## Arquivos
- `index.html`: estrutura da página e tela de PIN
- `config.js`: **PIN da equipe** e endereço do banco (troque o PIN aqui)
- `app.js`: cálculos e telas
- `tree.js`: desenho da árvore do custo por cliente
- `style.css`: visual, modo claro e noturno

## Publicar (gratuito)
1. Suba esta pasta em um repositório privado no GitHub.
2. No Netlify: Add new site > Import from GitHub > escolha o repositório. Sem comando de build; pasta de publicação: raiz.

## Trocar o PIN
Edite `config.js` no GitHub, altere `PIN` e salve. O Netlify publica sozinho.
