/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Reverse Office contributors
 * Immutable asset server, Linux x86-64. No libc, CRT, dynamic loader or libraries.
 * Linux syscall ABI numbers and structures are interface facts, not copied headers.
 * This server has no file access, request bodies, user accounts or writable state.
 */
typedef unsigned long usize;
typedef long word;
static word call(word n, word a, word b, word c, word d, word e, word f) {
  register word r10 __asm__("r10")=d;
  register word r8 __asm__("r8")=e;
  register word r9 __asm__("r9")=f;
  word result;
  __asm__ volatile("syscall" : "=a"(result) : "a"(n), "D"(a), "S"(b), "d"(c), "r"(r10), "r"(r8), "r"(r9) : "rcx", "r11", "memory");
  return result;
}
static int equal(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
static void closefd(word fd){call(3,fd,0,0,0,0,0);}
static int ready(word fd,short events){struct {int fd;short events,revents;} p={(int)fd,events,0};return call(7,(word)&p,1,2000,0,0,0)>0&&(p.revents&events);}
static int sendall(word fd,const unsigned char *data,usize size){while(size){word sent=call(44,fd,(word)data,size,0x4000,0,0);if(sent==-11){if(!ready(fd,4))return 0;continue;}if(sent<=0)return 0;data+=sent;size-=sent;}return 1;}
static char *append(char *p,const char *s){while(*s)*p++=*s++;return p;}
static char *decimal(char *p,usize value){char digits[24];int n=0;do{digits[n++]=(char)('0'+value%10);value/=10;}while(value);while(n)*p++=digits[--n];return p;}
struct asset {const char *path;const char *mime;const unsigned char *data;usize size;};
#include "assets.h"
static void respond(word fd,const char *status,const char *mime,const unsigned char *body,usize size,int head){
  char header[1800],*p=header;
  p=append(p,"HTTP/1.1 ");p=append(p,status);p=append(p,"\r\nContent-Type: ");p=append(p,mime);p=append(p,"\r\nContent-Length: ");p=decimal(p,size);
  p=append(p,"\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCross-Origin-Resource-Policy: same-origin\r\nX-Frame-Options: SAMEORIGIN\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src http://localhost:11434 http://127.0.0.1:11434 http://localhost:1234 http://127.0.0.1:1234 http://127.0.0.1:3210; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'\r\nPermissions-Policy: camera=(), microphone=(), geolocation=()\r\n\r\n");
  if(sendall(fd,(unsigned char*)header,(usize)(p-header))&&!head)sendall(fd,body,size);
}
static void request(word fd){
  /* SIGALRM default termination caps the entire child lifetime, including slow reads. */
  call(37,8,0,0,0,0,0);
  char buffer[8193];usize used=0;int complete=0;
  while(used<8192){if(!ready(fd,1))return;word n=call(0,fd,(word)(buffer+used),8192-used,0,0,0);if(n<=0)return;used+=(usize)n;buffer[used]=0;for(usize i=3;i<used;i++)if(buffer[i-3]=='\r'&&buffer[i-2]=='\n'&&buffer[i-1]=='\r'&&buffer[i]=='\n'){complete=1;break;}if(complete)break;}
  if(!complete){respond(fd,"431 Request Header Fields Too Large","text/plain",(const unsigned char*)"Request too large",17,0);return;}
  usize a=0;while(a<used&&buffer[a]!=' '&&buffer[a]!='\r'&&buffer[a]!='\n')a++;if(a>=used)return;buffer[a++]=0;
  int head=equal(buffer,"HEAD");if(!head&&!equal(buffer,"GET")){respond(fd,"405 Method Not Allowed","text/plain",(const unsigned char*)"Read-only server",16,0);return;}
  char *path=buffer+a;while(a<used&&buffer[a]!=' '&&buffer[a]!='\r'&&buffer[a]!='\n')a++;if(a>=used)return;buffer[a]=0;
  for(char *p=path;*p;p++)if(*p=='?'){*p=0;break;}
  if(equal(path,"/"))path="/index.html";
  for(usize i=0;i<ASSET_COUNT;i++)if(equal(path,assets[i].path)){respond(fd,"200 OK",assets[i].mime,assets[i].data,assets[i].size,head);return;}
  respond(fd,"404 Not Found","text/plain",(const unsigned char*)"Not found",9,head);
}
__attribute__((noreturn)) void serve(void){
  word listener=call(41,2,1,0,0,0,0);if(listener<0)call(60,1,0,0,0,0,0);
  int reuse=1;call(54,listener,1,2,(word)&reuse,sizeof(reuse),0);
  struct {unsigned short family,port;unsigned int address;unsigned char zero[8];} endpoint={2,0x901f,0,{0}};
  if(call(49,listener,(word)&endpoint,sizeof(endpoint),0,0,0)<0||call(50,listener,64,0,0,0,0)<0)call(60,2,0,0,0,0,0);
  const char message[]="Reverse Studio listening on :8080\n";call(1,1,(word)message,sizeof(message)-1,0,0,0);
  int children=0;
  for(;;){
    while(call(61,-1,0,1,0,0,0)>0)if(children>0)children--;
    if(children>=32){if(call(61,-1,0,0,0,0,0)>0)children--;continue;}
    word fd=call(288,listener,0,0,0x80000|0x800,0,0);if(fd<0)continue;
    word pid=call(57,0,0,0,0,0,0);
    if(pid==0){closefd(listener);request(fd);closefd(fd);call(60,0,0,0,0,0,0);}
    if(pid>0)children++;
    closefd(fd);
  }
}
__asm__(".global _start\n_start:\nxor %rbp,%rbp\nand $-16,%rsp\ncall serve\nud2\n");
