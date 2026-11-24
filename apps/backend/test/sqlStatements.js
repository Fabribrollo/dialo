// Separa sentencias sin cortar literales, comentarios ni bloques PostgreSQL.
export function splitStatements(sql) {
 const result=[];let text='',quote=null,dollar=null,line=false,blocks=0;
 for(let i=0;i<sql.length;i++){
  const c=sql[i],next=sql[i+1];
  if(line){if(c==='\n'){line=false;text+='\n';}continue;}
  if(blocks){if(c==='/'&&next==='*'){blocks++;i++;}else if(c==='*'&&next==='/'){blocks--;i++;}continue;}
  if(dollar){if(sql.startsWith(dollar,i)){text+=dollar;i+=dollar.length-1;dollar=null;}else text+=c;continue;}
  if(quote){text+=c;if(c===quote){if(next===quote){text+=next;i++;}else quote=null;}continue;}
  if(c==='-'&&next==='-'){line=true;text+=' ';i++;continue;}
  if(c==='/'&&next==='*'){blocks=1;text+=' ';i++;continue;}
  if(c==='\''||c==='"'){quote=c;text+=c;continue;}
  if(c==='$'){const tag=/^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];if(tag){dollar=tag;text+=tag;i+=tag.length-1;continue;}}
  if(c===';'){if(text.trim())result.push(text.trim());text='';}else text+=c;
 }
 if(quote||dollar||blocks)throw new Error('SQL de migración incompleto');
 if(text.trim())result.push(text.trim());return result;
}
